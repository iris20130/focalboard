package app

import (
	"encoding/json"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/mattermost/focalboard/server/model"
	"github.com/mattermost/focalboard/server/services/duereminder"

	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

const (
	dueReminderPrefEnabled        = "dueReminderEnabled"
	dueReminderPrefLeadDays       = "dueReminderLeadDays"
	dueReminderPrefInterval       = "dueReminderIntervalMinutes"
	dueReminderPrefWebhook        = "dueReminderFeishuWebhook"
	dueReminderPrefSecret         = "dueReminderFeishuSecret"
	dueReminderPrefDays           = "dueReminderDays"
	dueReminderPrefWindowStart    = "dueReminderWindowStartHour"
	dueReminderPrefWindowEnd      = "dueReminderWindowEndHour"
	dueReminderPrefMode           = "dueReminderMode"
	dueReminderPrefDailyTime      = "dueReminderDailyTime"
	dueReminderPrefLinkUrl        = "dueReminderLinkUrl"
	dueReminderPrefChannel        = "dueReminderChannel"
	dueReminderPrefPushOverdue    = "dueReminderPushOverdue"
	dueReminderPrefPushSoon       = "dueReminderPushSoon"
	dueReminderPrefPushPending    = "dueReminderPushPending"
	dueReminderPrefPendingLead    = "dueReminderPendingLeadDays"
	dueDatePropertyPrefPrefix     = "dueDateProperty:"
	pendingDatePropertyPrefPrefix = "pendingDateProperty:"
	dueReminderSentKeyPrefix      = "dueReminderSent:"
	dueReminderLastRunKeyPrefix   = "dueReminderLastRun:"
	dueReminderDailyDoneKeyPrefix = "dueReminderDailyDone:"
	dueReminderMaxCardsPerMessage = 40
)

// DueReminderSettings is the effective reminder configuration of one account.
type DueReminderSettings struct {
	Enabled           bool              `json:"enabled"`
	LeadDays          int               `json:"leadDays"`
	IntervalMinutes   int               `json:"intervalMinutes"`
	Webhook           string            `json:"webhook"`
	Secret            string            `json:"secret"`
	Days              string            `json:"days"`        // e.g. "1,2,3,4,5" (Mon=1..Sun=7)
	WindowStart       int               `json:"windowStart"` // hour, inclusive
	WindowEnd         int               `json:"windowEnd"`   // hour, inclusive
	Mode              string            `json:"mode"`        // "interval" | "daily"
	DailyTime         string            `json:"dailyTime"`   // "HH:MM"
	LinkURL           string            `json:"linkUrl"`     // custom open link, empty = serverRoot
	Channel           string            `json:"channel"`     // feishu|wecom|dingtalk|ftqq|custom
	PushOverdue       bool              `json:"pushOverdue"`
	PushSoon          bool              `json:"pushSoon"`
	PushPending       bool              `json:"pushPending"`
	PendingLeadDays   int               `json:"pendingLeadDays"` // workdays grace before chasing pending items
	DateProperties    map[string]string `json:"dateProperties"`
	PendingProperties map[string]string `json:"pendingProperties"`
}

// GetDueReminderSettings returns the account settings, falling back to the
// values in config.json for every field the account did not override.
func (a *App) GetDueReminderSettings(userID string) (DueReminderSettings, DueReminderSettings, error) {
	defaults := a.dueReminderDefaults()
	settings := defaults
	settings.DateProperties = map[string]string{}
	settings.PendingProperties = map[string]string{}

	preferences, err := a.store.GetUserPreferences(userID)
	if err != nil {
		return settings, defaults, err
	}

	for _, preference := range preferences {
		value := strings.TrimSpace(preference.Value)
		switch preference.Name {
		case dueReminderPrefEnabled:
			settings.Enabled = strings.EqualFold(value, "true")
		case dueReminderPrefLeadDays:
			if parsed, parseErr := strconv.Atoi(value); parseErr == nil {
				settings.LeadDays = parsed
			}
		case dueReminderPrefInterval:
			if parsed, parseErr := strconv.Atoi(value); parseErr == nil {
				settings.IntervalMinutes = parsed
			}
		case dueReminderPrefWebhook:
			settings.Webhook = value
		case dueReminderPrefSecret:
			settings.Secret = value
		case dueReminderPrefDays:
			if value != "" {
				settings.Days = value
			}
		case dueReminderPrefWindowStart:
			if parsed, parseErr := strconv.Atoi(value); parseErr == nil {
				settings.WindowStart = clampInt(parsed, 0, 23)
			}
		case dueReminderPrefWindowEnd:
			if parsed, parseErr := strconv.Atoi(value); parseErr == nil {
				settings.WindowEnd = clampInt(parsed, 0, 23)
			}
		case dueReminderPrefMode:
			if value == "interval" || value == "daily" {
				settings.Mode = value
			}
		case dueReminderPrefDailyTime:
			if t, parseErr := time.Parse("15:04", value); parseErr == nil {
				settings.DailyTime = t.Format("15:04")
			}
		case dueReminderPrefLinkUrl:
			settings.LinkURL = value
		case dueReminderPrefChannel:
			switch value {
			case "feishu", "wecom", "dingtalk", "ftqq", "custom":
				settings.Channel = value
			}
		case dueReminderPrefPushOverdue:
			settings.PushOverdue = strings.EqualFold(value, "true")
		case dueReminderPrefPushSoon:
			settings.PushSoon = strings.EqualFold(value, "true")
		case dueReminderPrefPushPending:
			settings.PushPending = strings.EqualFold(value, "true")
		case dueReminderPrefPendingLead:
			if parsed, parseErr := strconv.Atoi(value); parseErr == nil {
				settings.PendingLeadDays = clampInt(parsed, 0, 365)
			}
		default:
			if strings.HasPrefix(preference.Name, dueDatePropertyPrefPrefix) && value != "" {
				boardID := strings.TrimPrefix(preference.Name, dueDatePropertyPrefPrefix)
				if boardID != "" {
					settings.DateProperties[boardID] = value
				}
			}
			if strings.HasPrefix(preference.Name, pendingDatePropertyPrefPrefix) && value != "" {
				boardID := strings.TrimPrefix(preference.Name, pendingDatePropertyPrefPrefix)
				if boardID != "" {
					settings.PendingProperties[boardID] = value
				}
			}
		}
	}

	settings.LeadDays = clampInt(settings.LeadDays, 0, 365)
	settings.IntervalMinutes = clampInt(settings.IntervalMinutes, 1, 24*60)
	return settings, defaults, nil
}

// SetDueDateProperty stores which date property should be used to calculate
// overdue/soon status for one board. An empty property restores automatic
// detection.
func (a *App) SetDueDateProperty(userID, boardID, propertyID string) error {
	boardID = strings.TrimSpace(boardID)
	if boardID == "" {
		return fmt.Errorf("boardId is required")
	}
	key := dueDatePropertyPrefPrefix + boardID
	propertyID = strings.TrimSpace(propertyID)
	if propertyID == "" {
		_, err := a.UpdateUserConfig(userID, model.UserPreferencesPatch{
			DeletedFields: []string{key},
		})
		return err
	}
	_, err := a.UpdateUserConfig(userID, model.UserPreferencesPatch{
		UpdatedFields: map[string]string{key: propertyID},
	})
	return err
}

func (a *App) dueReminderDefaults() DueReminderSettings {
	return DueReminderSettings{
		Enabled:         a.config.DueReminderEnabled,
		LeadDays:        clampInt(a.config.DueReminderLeadDays, 0, 365),
		IntervalMinutes: clampInt(a.config.DueReminderIntervalMinutes, 1, 24*60),
		Webhook:         a.config.DueReminderFeishuWebhook,
		Secret:          a.config.DueReminderFeishuSecret,
		Days:            "1,2,3,4,5",
		WindowStart:     9,
		WindowEnd:       17,
		Mode:            "interval",
		DailyTime:       "09:00",
		Channel:         "feishu",
		PushOverdue:     true,
		PushSoon:        true,
		PushPending:     false,
		PendingLeadDays: 3,
	}
}

func clampInt(value, minValue, maxValue int) int {
	if value < minValue {
		return minValue
	}
	if value > maxValue {
		return maxValue
	}
	return value
}

// SendDueRemindersForUser sends one account's reminders and returns how many
// cards were included. Cards already sent for the same day and due date are
// skipped per account unless force is set (used by the "send now" test button).
// Overdue/soon/pending inclusion follows the account's push checkboxes; due
// dates follow the per-board date property selection; soon/pending windows
// count workdays only.
func (a *App) SendDueRemindersForUser(userID, username string, settings DueReminderSettings, force bool) (int, error) {
	if !settings.Enabled || settings.Webhook == "" {
		return 0, nil
	}

	cards, err := a.GetDueCardsForUser(userID, settings.LeadDays)
	if err != nil {
		return 0, err
	}

	today := time.Now().Format("2006-01-02")
	lines := make([]string, 0, 20)
	sent := make([]*model.DueCard, 0, 20)

	appendCard := func(card *model.DueCard, label string) bool {
		if !force {
			key := dueReminderSentKeyPrefix + userID + ":" + card.CardID
			marker := today + "|" + label
			if stored, storedErr := a.store.GetSystemSetting(key); storedErr == nil && stored == marker {
				return false
			}
		}
		lines = append(lines, fmt.Sprintf("• [%s] %s — %s", card.BoardTitle, card.CardTitle, label))
		sent = append(sent, card)
		return len(lines) < dueReminderMaxCardsPerMessage
	}

	for _, card := range cards {
		if len(lines) >= dueReminderMaxCardsPerMessage {
			break
		}
		if card.Status == "overdue" && !settings.PushOverdue {
			continue
		}
		if (card.Status == "today" || card.Status == "soon") && !settings.PushSoon {
			continue
		}
		if !appendCard(card, dueCardLabel(card)) {
			break
		}
	}

	if settings.PushPending {
		pending, pendingErr := a.GetPendingCardsForUser(userID, -1)
		if pendingErr == nil {
			for _, card := range pending {
				if len(lines) >= dueReminderMaxCardsPerMessage {
					break
				}
				if !appendCard(card, dueCardLabel(card)) {
					break
				}
			}
		}
	}

	if len(lines) == 0 {
		return 0, nil
	}

	link := settings.LinkURL
	if link == "" {
		link = a.config.ServerRoot
	}
	text := fmt.Sprintf("Focalboard 到期提醒 %s\n账号：%s\n%s\n\n打开：%s", today, username, strings.Join(lines, "\n"), link)
	if err := duereminder.Send(settings.Channel, settings.Webhook, settings.Secret, text); err != nil {
		return 0, err
	}

	for _, card := range sent {
		key := dueReminderSentKeyPrefix + userID + ":" + card.CardID
		marker := today + "|" + dueCardLabel(card)
		if err := a.store.SetSystemSetting(key, marker); err != nil {
			a.logger.Warn("Unable to persist due reminder state", mlog.String("cardID", card.CardID))
		}
	}
	return len(sent), nil
}

// SendDueReminderTest sends a sample message so the account can verify its
// webhook without waiting for the scheduler.
func (a *App) SendDueReminderTest(userID, username string) error {
	settings, _, err := a.GetDueReminderSettings(userID)
	if err != nil {
		return err
	}
	if settings.Webhook == "" {
		return fmt.Errorf("请先填写飞书 Webhook 地址")
	}
	text := fmt.Sprintf("Focalboard 到期提醒测试\n账号：%s\n如果你收到这条消息，说明该账户的推送配置已生效。", username)
	return duereminder.Send(settings.Channel, settings.Webhook, settings.Secret, text)
}

// dueCardLabel mirrors the sidebar wording so pushes and board stay in sync.
func dueCardLabel(card *model.DueCard) string {
	switch card.Status {
	case "overdue":
		return fmt.Sprintf("已逾期 %d 天", -card.DaysUntilDue)
	case "today":
		return "今天到期"
	case "pending":
		return fmt.Sprintf("待返超时 %d 天", -card.DaysUntilDue)
	default:
		return fmt.Sprintf("快临期 %d 天", card.DaysUntilDue)
	}
}

func dueCardDate(millis int64) string {
	return time.UnixMilli(millis).Format("2006-01-02")
}

var doneOptionRe = regexp.MustCompile(`^(已完成|完成|done|completed|complete|closed)$`)

// completedRule returns (propertyID, optionID) of the "completed" select
// option, mirroring the frontend auto-detection so pushes skip exactly the
// cards the sidebar hides. Card properties store option IDs keyed by the
// property ID, so both values are needed for the comparison.
func completedRule(board *model.Board) (string, string) {
	type optionInfo struct {
		ID    string `json:"id"`
		Value string `json:"value"`
	}
	type templateInfo struct {
		ID      string       `json:"id"`
		Name    string       `json:"name"`
		Type    string       `json:"type"`
		Options []optionInfo `json:"options"`
	}
	bestPropID, bestOptID := "", ""
	bestIsStatus := false
	for _, raw := range board.CardProperties {
		buf, err := json.Marshal(raw)
		if err != nil {
			continue
		}
		var property templateInfo
		if err := json.Unmarshal(buf, &property); err != nil || property.Type != "select" {
			continue
		}
		doneID := ""
		for _, option := range property.Options {
			if doneOptionRe.MatchString(strings.TrimSpace(option.Value)) {
				doneID = option.ID
				break
			}
		}
		if doneID == "" {
			continue
		}
		isStatus := strings.Contains(property.Name, "状态") || strings.Contains(strings.ToLower(property.Name), "status")
		if !bestIsStatus || isStatus {
			bestPropID, bestOptID = property.ID, doneID
			bestIsStatus = isStatus
		}
	}
	return bestPropID, bestOptID
}

// isCompleted checks a card's status property against the completed option.
func isCompleted(properties map[string]interface{}, statusPropID, doneOptionID string) bool {
	if statusPropID == "" || doneOptionID == "" {
		return false
	}
	raw, ok := properties[statusPropID]
	if !ok {
		return false
	}
	switch v := raw.(type) {
	case string:
		return v == doneOptionID
	case []interface{}:
		for _, item := range v {
			if s, ok := item.(string); ok && s == doneOptionID {
				return true
			}
		}
	case []string:
		for _, s := range v {
			if s == doneOptionID {
				return true
			}
		}
	}
	return false
}

type propertyTemplateInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
}

func (a *App) userBoards(userID string) ([]*model.Board, error) {
	teams, err := a.store.GetTeamsForUser(userID)
	if err != nil {
		return nil, err
	}

	seen := map[string]bool{}
	boards := make([]*model.Board, 0)
	for _, team := range teams {
		teamBoards, errBoards := a.store.GetBoardsForUserAndTeam(userID, team.ID, true)
		if errBoards != nil {
			return nil, errBoards
		}
		for _, board := range teamBoards {
			if seen[board.ID] || board.IsTemplate || board.DeleteAt != 0 {
				continue
			}
			seen[board.ID] = true
			boards = append(boards, board)
		}
	}
	return boards, nil
}

func (a *App) userDueDateProperties(userID string) (map[string]string, error) {
	dateProperties := map[string]string{}
	preferences, err := a.store.GetUserPreferences(userID)
	if err != nil {
		return nil, err
	}
	for _, preference := range preferences {
		if !strings.HasPrefix(preference.Name, dueDatePropertyPrefPrefix) {
			continue
		}
		value := strings.TrimSpace(preference.Value)
		boardID := strings.TrimPrefix(preference.Name, dueDatePropertyPrefPrefix)
		if boardID != "" && value != "" {
			dateProperties[boardID] = value
		}
	}
	return dateProperties, nil
}

// GetDueCardsForUser returns the cards that are overdue or due within leadDays
// on the boards the user can access.
func (a *App) GetDueCardsForUser(userID string, leadDays int) ([]*model.DueCard, error) {
	boards, err := a.userBoards(userID)
	if err != nil {
		return nil, err
	}
	dateProperties, err := a.userDueDateProperties(userID)
	if err != nil {
		return nil, err
	}
	return a.dueCardsForBoards(boards, leadDays, dateProperties)
}

// userPendingDateProperties reads per-board "pending-return date property"
// selections (pendingDateProperty:<boardId>).
func (a *App) userPendingDateProperties(userID string) (map[string]string, error) {
	result := map[string]string{}
	preferences, err := a.store.GetUserPreferences(userID)
	if err != nil {
		return nil, err
	}
	for _, preference := range preferences {
		if !strings.HasPrefix(preference.Name, pendingDatePropertyPrefPrefix) {
			continue
		}
		value := strings.TrimSpace(preference.Value)
		boardID := strings.TrimPrefix(preference.Name, pendingDatePropertyPrefPrefix)
		if boardID != "" && value != "" {
			result[boardID] = value
		}
	}
	return result, nil
}

// SetPendingDateProperty stores which date property drives the pending-return
// list for one board. An empty property disables pending for that board.
func (a *App) SetPendingDateProperty(userID, boardID, propertyID string) error {
	boardID = strings.TrimSpace(boardID)
	if boardID == "" {
		return fmt.Errorf("boardId is required")
	}
	key := pendingDatePropertyPrefPrefix + boardID
	propertyID = strings.TrimSpace(propertyID)
	if propertyID == "" {
		_, err := a.UpdateUserConfig(userID, model.UserPreferencesPatch{
			DeletedFields: []string{key},
		})
		return err
	}
	_, err := a.UpdateUserConfig(userID, model.UserPreferencesPatch{
		UpdatedFields: map[string]string{key: propertyID},
	})
	return err
}

// GetPendingCardsForUser returns cards whose user-selected pending date
// property holds a date more than leadDays workdays in the past. leadDays < 0
// disables the grace filter (sidebar shows everything past due).
func (a *App) GetPendingCardsForUser(userID string, leadDays int) ([]*model.DueCard, error) {
	boards, err := a.userBoards(userID)
	if err != nil {
		return nil, err
	}
	pendingProperties, err := a.userPendingDateProperties(userID)
	if err != nil {
		return nil, err
	}

	result := make([]*model.DueCard, 0)
	for _, board := range boards {
		cards, errCards := a.pendingCardsForBoard(board, pendingProperties[board.ID], leadDays)
		if errCards != nil {
			return nil, errCards
		}
		result = append(result, cards...)
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].BoardTitle == result[j].BoardTitle {
			return result[i].CardTitle < result[j].CardTitle
		}
		return result[i].BoardTitle < result[j].BoardTitle
	})
	return result, nil
}

// GetAllDueCards returns due cards across every board. Used by the notification
// scheduler, which has no user context.
func (a *App) GetAllDueCards(leadDays int) ([]*model.DueCard, error) {
	boards, _, err := a.store.GetBoardsForCompliance(model.QueryBoardsForComplianceOptions{})
	if err != nil {
		return nil, err
	}

	filtered := make([]*model.Board, 0, len(boards))
	for _, board := range boards {
		if board.IsTemplate || board.DeleteAt != 0 {
			continue
		}
		filtered = append(filtered, board)
	}

	return a.dueCardsForBoards(filtered, leadDays, nil)
}

func (a *App) dueCardsForBoards(boards []*model.Board, leadDays int, dateProperties map[string]string) ([]*model.DueCard, error) {
	now := time.Now()
	result := make([]*model.DueCard, 0)
	for _, board := range boards {
		cards, err := a.dueCardsForBoard(board, leadDays, now, dateProperties[board.ID])
		if err != nil {
			return nil, err
		}
		result = append(result, cards...)
	}

	sort.Slice(result, func(i, j int) bool {
		if result[i].DaysUntilDue == result[j].DaysUntilDue {
			return result[i].BoardTitle < result[j].BoardTitle
		}
		return result[i].DaysUntilDue < result[j].DaysUntilDue
	})
	return result, nil
}

func (a *App) dueCardsForBoard(board *model.Board, leadDays int, now time.Time, preferredDatePropertyID string) ([]*model.DueCard, error) {
	propertyID, propertyName, ok := dueDateProperty(board, preferredDatePropertyID)
	if !ok {
		return nil, nil
	}
	statusPropID, doneID := completedRule(board)

	blocks, err := a.store.GetBlocksWithType(board.ID, string(model.TypeCard))
	if err != nil {
		return nil, err
	}

	cards := make([]*model.DueCard, 0)
	for _, block := range blocks {
		rawValue, ok := block.Fields["properties"]
		if !ok {
			continue
		}
		properties, ok := rawValue.(map[string]interface{})
		if !ok {
			continue
		}
		if isCompleted(properties, statusPropID, doneID) {
			continue
		}
		dueAt, ok := parseStoredDate(properties[propertyID])
		if !ok {
			continue
		}
		status, days, within := dueCardStatus(dueAt, leadDays, now)
		if !within {
			continue
		}
		// days is negative when overdue; report workdays remaining so the
		// sidebar and pushes both show "N workdays left".
		displayDays := days
		if days > 0 {
			dueDay := time.UnixMilli(dueAt).In(now.Location())
			dueDay = time.Date(dueDay.Year(), dueDay.Month(), dueDay.Day(), 0, 0, 0, 0, now.Location())
			today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
			displayDays = workdaysBetween(today, dueDay)
		}
		cards = append(cards, &model.DueCard{
			TeamID:          board.TeamID,
			BoardID:         board.ID,
			BoardTitle:      board.Title,
			BoardIcon:       board.Icon,
			CardID:          block.ID,
			CardTitle:       block.Title,
			DuePropertyName: propertyName,
			DueAt:           dueAt,
			DaysUntilDue:    displayDays,
			Status:          status,
			Properties:      cardPropertyStrings(properties),
		})
	}
	return cards, nil
}

// pendingCardsForBoard lists cards whose user-selected pending date property
// has a date; the chase deadline is that date + N workdays. Overdue days are
// counted in workdays from the deadline, matching soon/overdue math.
func (a *App) pendingCardsForBoard(board *model.Board, preferredPropertyID string, leadDays int) ([]*model.DueCard, error) {
	propertyID, propertyName, ok := dueDateProperty(board, preferredPropertyID)
	if !ok || preferredPropertyID == "" {
		return nil, nil
	}
	statusPropID, doneID := completedRule(board)

	blocks, err := a.store.GetBlocksWithType(board.ID, string(model.TypeCard))
	if err != nil {
		return nil, err
	}

	cards := make([]*model.DueCard, 0)
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	for _, block := range blocks {
		rawValue, ok := block.Fields["properties"]
		if !ok {
			continue
		}
		properties, ok := rawValue.(map[string]interface{})
		if !ok {
			continue
		}
		if isCompleted(properties, statusPropID, doneID) {
			continue
		}
		pendingAt, ok := parseStoredDate(properties[propertyID])
		if !ok {
			continue
		}
		pendingDay := time.UnixMilli(pendingAt).In(now.Location())
		pendingDay = time.Date(pendingDay.Year(), pendingDay.Month(), pendingDay.Day(), 0, 0, 0, 0, now.Location())
		chaseDay := addWorkdays(pendingDay, leadDays+1)
		if today.Before(chaseDay) {
			continue
		}
		overdue := workdaysBetween(chaseDay.AddDate(0, 0, -1), today)
		cards = append(cards, &model.DueCard{
			TeamID:          board.TeamID,
			BoardID:         board.ID,
			BoardTitle:      board.Title,
			BoardIcon:       board.Icon,
			CardID:          block.ID,
			CardTitle:       block.Title,
			DuePropertyName: propertyName,
			DueAt:           pendingAt,
			DaysUntilDue:    -overdue,
			Status:          "pending",
			Properties:      cardPropertyStrings(properties),
		})
	}
	return cards, nil
}

func cardPropertyStrings(properties map[string]interface{}) map[string]string {
	result := make(map[string]string)
	for key, value := range properties {
		switch v := value.(type) {
		case string:
			result[key] = v
		case []interface{}:
			if len(v) > 0 {
				if first, ok := v[0].(string); ok {
					result[key] = first
				}
			}
		case []string:
			if len(v) > 0 {
				result[key] = v[0]
			}
		}
	}
	return result
}

func dueDateProperty(board *model.Board, preferredID string) (string, string, bool) {
	templates := make([]propertyTemplateInfo, 0, len(board.CardProperties))
	for _, raw := range board.CardProperties {
		buf, err := json.Marshal(raw)
		if err != nil {
			continue
		}
		var property propertyTemplateInfo
		if err := json.Unmarshal(buf, &property); err != nil || property.ID == "" || property.Type != "date" {
			continue
		}
		templates = append(templates, property)
	}
	if len(templates) == 0 {
		return "", "", false
	}
	if preferredID != "" {
		for _, property := range templates {
			if property.ID == preferredID {
				return property.ID, property.Name, true
			}
		}
	}
	for _, property := range templates {
		lower := strings.ToLower(property.Name)
		if strings.Contains(lower, "due") || strings.Contains(lower, "deadline") ||
			strings.Contains(property.Name, "截止") || strings.Contains(property.Name, "到期") {
			return property.ID, property.Name, true
		}
	}
	return templates[0].ID, templates[0].Name, true
}

func parseStoredDate(value interface{}) (int64, bool) {
	switch v := value.(type) {
	case string:
		text := strings.TrimSpace(v)
		if text == "" {
			return 0, false
		}
		if strings.HasPrefix(text, "{") {
			var dateProperty struct {
				From        int64 `json:"from"`
				To          int64 `json:"to"`
				IncludeTime bool  `json:"includeTime"`
			}
			if err := json.Unmarshal([]byte(text), &dateProperty); err == nil {
				if dateProperty.From > 0 {
					return dateProperty.From, true
				}
				if dateProperty.To > 0 {
					return dateProperty.To, true
				}
			}
			return 0, false
		}
		millis, err := strconv.ParseInt(text, 10, 64)
		if err != nil {
			return 0, false
		}
		return millis, true
	case float64:
		return int64(v), v > 0
	case json.Number:
		millis, err := v.Int64()
		return millis, err == nil && millis > 0
	default:
		return 0, false
	}
}

func dueCardStatus(dueAt int64, leadDays int, now time.Time) (string, int, bool) {
	due := time.UnixMilli(dueAt).In(now.Location())
	dueDay := time.Date(due.Year(), due.Month(), due.Day(), 0, 0, 0, 0, now.Location())
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	days := int(dueDay.Sub(today).Hours() / 24)

	switch {
	case days < 0:
		return "overdue", days, true
	case days == 0:
		return "today", days, true
	case workdaysBetween(today, dueDay) <= leadDays:
		return "soon", days, true
	default:
		return "", days, false
	}
}

// workdaysBetween counts Mon-Fri days in (start, end], i.e. how many workdays
// remain until end. Weekends are skipped so "3 workdays before deadline"
// pushes earlier when the deadline lands right after a weekend.
func workdaysBetween(start, end time.Time) int {
	if !end.After(start) {
		return 0
	}
	count := 0
	day := start
	for day.Before(end) {
		day = day.AddDate(0, 0, 1)
		w := day.Weekday()
		if w != time.Saturday && w != time.Sunday {
			count++
		}
	}
	return count
}

// addWorkdays returns the date N Mon-Fri days after start.
func addWorkdays(start time.Time, n int) time.Time {
	day := start
	for n > 0 {
		day = day.AddDate(0, 0, 1)
		w := day.Weekday()
		if w != time.Saturday && w != time.Sunday {
			n--
		}
	}
	return day
}
