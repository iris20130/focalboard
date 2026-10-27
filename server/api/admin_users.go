package api

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/gorilla/mux"

	"github.com/mattermost/focalboard/server/model"
	"github.com/mattermost/focalboard/server/services/audit"
)

const (
	minPasswordLength = 6
)

type adminUser struct {
	ID       string `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email"`
	CreateAt int64  `json:"createAt"`
	IsAdmin  bool   `json:"isAdmin"`
	IsSelf   bool   `json:"isSelf"`
}

type adminCreateUserRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type adminPasswordRequest struct {
	Password string `json:"password"`
}

func (a *API) registerAdminRoutes(r *mux.Router) {
	r.HandleFunc("/admin/users", a.requireSystemAdmin(a.handleAdminListUsers)).Methods(http.MethodGet)
	r.HandleFunc("/admin/users", a.requireSystemAdmin(a.handleAdminCreateUser)).Methods(http.MethodPost)
	r.HandleFunc("/admin/users/{userID}/password", a.requireSystemAdmin(a.handleAdminResetPassword)).Methods(http.MethodPut)
	r.HandleFunc("/admin/users/{userID}", a.requireSystemAdmin(a.handleAdminDeleteUser)).Methods(http.MethodDelete)
}

func (a *API) requireSystemAdmin(handler func(w http.ResponseWriter, r *http.Request)) func(w http.ResponseWriter, r *http.Request) {
	return a.sessionRequired(func(w http.ResponseWriter, r *http.Request) {
		if !a.app.IsSystemAdmin(getUserID(r)) {
			a.errorResponse(w, r, model.NewErrForbidden("administrator only"))
			return
		}
		handler(w, r)
	})
}

func (a *API) handleAdminListUsers(w http.ResponseWriter, r *http.Request) {
	auditRec := a.makeAuditRecord(r, "adminListUsers", audit.Fail)
	defer a.audit.LogRecord(audit.LevelRead, auditRec)

	users, err := a.app.GetTeamUsers(model.GlobalTeamID, "")
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	selfID := getUserID(r)
	adminID := ""
	if a.app.IsSystemAdmin(selfID) {
		adminID = selfID
	}
	result := make([]adminUser, 0, len(users))
	for _, user := range users {
		result = append(result, adminUser{
			ID:       user.ID,
			Username: user.Username,
			Email:    user.Email,
			CreateAt: user.CreateAt,
			IsAdmin:  adminID != "" && user.ID == adminID,
			IsSelf:   user.ID == selfID,
		})
	}

	jsonBytesResponse(w, http.StatusOK, mustMarshal(result))
	auditRec.Success()
}

func (a *API) handleAdminCreateUser(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	var request adminCreateUserRequest
	if err := json.Unmarshal(body, &request); err != nil {
		a.errorResponse(w, r, err)
		return
	}
	request.Username = strings.TrimSpace(request.Username)
	request.Email = strings.TrimSpace(request.Email)
	if request.Username == "" || request.Password == "" {
		a.errorResponse(w, r, model.NewErrBadRequest("username and password are required"))
		return
	}

	auditRec := a.makeAuditRecord(r, "adminCreateUser", audit.Fail)
	defer a.audit.LogRecord(audit.LevelModify, auditRec)
	auditRec.AddMeta("username", request.Username)

	if err := a.app.RegisterUser(request.Username, request.Email, request.Password); err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonStringResponse(w, http.StatusOK, "{}")
	auditRec.Success()
}

func (a *API) handleAdminResetPassword(w http.ResponseWriter, r *http.Request) {
	userID := mux.Vars(r)["userID"]
	body, err := io.ReadAll(r.Body)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	var request adminPasswordRequest
	if err := json.Unmarshal(body, &request); err != nil {
		a.errorResponse(w, r, err)
		return
	}
	if len(strings.TrimSpace(request.Password)) < minPasswordLength {
		a.errorResponse(w, r, model.NewErrBadRequest("password must be at least 6 characters"))
		return
	}

	user, err := a.app.GetUser(userID)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}

	auditRec := a.makeAuditRecord(r, "adminResetPassword", audit.Fail)
	defer a.audit.LogRecord(audit.LevelModify, auditRec)
	auditRec.AddMeta("userID", userID)

	if err := a.app.UpdateUserPassword(user.Username, request.Password); err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonStringResponse(w, http.StatusOK, "{}")
	auditRec.Success()
}

func (a *API) handleAdminDeleteUser(w http.ResponseWriter, r *http.Request) {
	userID := mux.Vars(r)["userID"]
	if userID == getUserID(r) {
		a.errorResponse(w, r, model.NewErrBadRequest("you cannot remove your own account"))
		return
	}

	auditRec := a.makeAuditRecord(r, "adminDeleteUser", audit.Fail)
	defer a.audit.LogRecord(audit.LevelModify, auditRec)
	auditRec.AddMeta("userID", userID)

	if err := a.app.DeleteUser(userID); err != nil {
		a.errorResponse(w, r, err)
		return
	}

	jsonStringResponse(w, http.StatusOK, "{}")
	auditRec.Success()
}

func mustMarshal(value interface{}) []byte {
	data, err := json.Marshal(value)
	if err != nil {
		return []byte("[]")
	}
	return data
}
