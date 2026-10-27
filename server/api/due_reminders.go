package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
	"github.com/mattermost/focalboard/server/model"
	"github.com/mattermost/focalboard/server/services/audit"
)

func (a *API) registerDueReminderRoutes(r *mux.Router) {
	r.HandleFunc("/due-reminders", a.sessionRequired(a.handleGetDueReminders)).Methods("GET")
	r.HandleFunc("/due-reminders/pending", a.sessionRequired(a.handleGetPendingCards)).Methods("GET")
	r.HandleFunc("/due-reminders/settings", a.sessionRequired(a.handleGetDueReminderSettings)).Methods("GET")
	r.HandleFunc("/due-reminders/date-property", a.sessionRequired(a.handleSetDueDateProperty)).Methods("POST")
	r.HandleFunc("/due-reminders/pending-date-property", a.sessionRequired(a.handleSetPendingDateProperty)).Methods("POST")
	r.HandleFunc("/due-reminders/send-now", a.sessionRequired(a.handleSendDueReminderNow)).Methods("POST")
	r.HandleFunc("/due-reminders/test", a.sessionRequired(a.handleTestDueReminder)).Methods("POST")
}

type dueDatePropertyRequest struct {
	BoardID    string `json:"boardId"`
	PropertyID string `json:"propertyId"`
}

func (a *API) handleSetDueDateProperty(w http.ResponseWriter, r *http.Request) {
	var request dueDatePropertyRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest("invalid request body"))
		return
	}
	if err := a.app.SetDueDateProperty(getUserID(r), request.BoardID, request.PropertyID); err != nil {
		a.errorResponse(w, r, err)
		return
	}
	jsonBytesResponse(w, http.StatusOK, []byte(`{"ok":true}`))
}

type dueReminderSettingsResponse struct {
	Enabled             bool              `json:"enabled"`
	LeadDays            int               `json:"leadDays"`
	IntervalMinutes     int               `json:"intervalMinutes"`
	Webhook             string            `json:"webhook"`
	SecretConfigured    bool              `json:"secretConfigured"`
	UsingDefaultWebhook bool              `json:"usingDefaultWebhook"`
	DefaultEnabled      bool              `json:"defaultEnabled"`
	DefaultLeadDays     int               `json:"defaultLeadDays"`
	DefaultInterval     int               `json:"defaultInterval"`
	DefaultHasWebhook   bool              `json:"defaultHasWebhook"`
	Days                string            `json:"days"`
	WindowStart         int               `json:"windowStart"`
	WindowEnd           int               `json:"windowEnd"`
	Mode                string            `json:"mode"`
	DailyTime           string            `json:"dailyTime"`
	LinkURL             string            `json:"linkUrl"`
	Channel             string            `json:"channel"`
	PushOverdue         bool              `json:"pushOverdue"`
	PushSoon            bool              `json:"pushSoon"`
	PushPending         bool              `json:"pushPending"`
	PendingLeadDays     int               `json:"pendingLeadDays"`
	DateProperties      map[string]string `json:"dateProperties"`
	PendingProperties   map[string]string `json:"pendingProperties"`
}

func (a *API) handleGetDueReminderSettings(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	settings, defaults, err := a.app.GetDueReminderSettings(userID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	preferences, err := a.app.GetUserPreferences(userID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}
	hasWebhookPref := false
	for _, preference := range preferences {
		if preference.Name == "dueReminderFeishuWebhook" {
			hasWebhookPref = preference.Value != ""
		}
	}

	response := dueReminderSettingsResponse{
		Enabled:             settings.Enabled,
		LeadDays:            settings.LeadDays,
		IntervalMinutes:     settings.IntervalMinutes,
		Webhook:             settings.Webhook,
		SecretConfigured:    settings.Secret != "",
		UsingDefaultWebhook: !hasWebhookPref && defaults.Webhook != "",
		DefaultEnabled:      defaults.Enabled,
		DefaultLeadDays:     defaults.LeadDays,
		DefaultInterval:     defaults.IntervalMinutes,
		DefaultHasWebhook:   defaults.Webhook != "",
		Days:                settings.Days,
		WindowStart:         settings.WindowStart,
		WindowEnd:           settings.WindowEnd,
		Mode:                settings.Mode,
		DailyTime:           settings.DailyTime,
		LinkURL:             settings.LinkURL,
		Channel:             settings.Channel,
		PushOverdue:         settings.PushOverdue,
		PushSoon:            settings.PushSoon,
		PushPending:         settings.PushPending,
		PendingLeadDays:     settings.PendingLeadDays,
		DateProperties:      settings.DateProperties,
	}
	if !hasWebhookPref {
		response.Webhook = ""
	}

	data, err := json.Marshal(response)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}
	jsonBytesResponse(w, http.StatusOK, data)
}

func (a *API) handleTestDueReminder(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	user, err := a.app.GetUser(userID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	auditRec := a.makeAuditRecord(r, "testDueReminder", audit.Fail)
	defer a.audit.LogRecord(audit.LevelModify, auditRec)

	if err := a.app.SendDueReminderTest(userID, user.Username); err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonStringResponse(w, http.StatusOK, "{}")
	auditRec.Success()
}

func (a *API) handleSetPendingDateProperty(w http.ResponseWriter, r *http.Request) {
	var request dueDatePropertyRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest("invalid request body"))
		return
	}
	if err := a.app.SetPendingDateProperty(getUserID(r), request.BoardID, request.PropertyID); err != nil {
		a.errorResponse(w, r, err)
		return
	}
	jsonBytesResponse(w, http.StatusOK, []byte(`{"ok":true}`))
}

func (a *API) handleSendDueReminderNow(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	user, err := a.app.GetUser(userID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}
	settings, _, err := a.app.GetDueReminderSettings(userID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}
	if settings.Webhook == "" {
		a.errorResponse(w, r, model.NewErrBadRequest("请先填写 Webhook 地址"))
		return
	}

	auditRec := a.makeAuditRecord(r, "sendDueReminderNow", audit.Fail)
	defer a.audit.LogRecord(audit.LevelModify, auditRec)

	count, sendErr := a.app.SendDueRemindersForUser(userID, user.Username, settings, true)
	if sendErr != nil {
		a.errorResponse(w, r, sendErr)
		return
	}

	data, _ := json.Marshal(map[string]int{"count": count})
	jsonBytesResponse(w, http.StatusOK, data)
	auditRec.Success()
}

func (a *API) handleGetDueReminders(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)
	leadDays := 3
	if raw := r.URL.Query().Get("leadDays"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed >= 0 && parsed <= 365 {
			leadDays = parsed
		}
	}

	auditRec := a.makeAuditRecord(r, "getDueReminders", audit.Fail)
	defer a.audit.LogRecord(audit.LevelRead, auditRec)

	cards, err := a.app.GetDueCardsForUser(userID, leadDays)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	data, err := json.Marshal(cards)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)
	auditRec.AddMeta("cardsCount", len(cards))
	auditRec.Success()
}

func (a *API) handleGetPendingCards(w http.ResponseWriter, r *http.Request) {
	userID := getUserID(r)

	auditRec := a.makeAuditRecord(r, "getPendingCards", audit.Fail)
	defer a.audit.LogRecord(audit.LevelRead, auditRec)

	cards, err := a.app.GetPendingCardsForUser(userID, -1)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	data, err := json.Marshal(cards)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonBytesResponse(w, http.StatusOK, data)
	auditRec.AddMeta("cardsCount", len(cards))
	auditRec.Success()
}
