// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/gorilla/mux"
	"github.com/mattermost/focalboard/server/model"
)

func (a *API) registerLeaveRoutes(r *mux.Router) {
	r.HandleFunc("/leaves/summary", a.sessionRequired(a.handleLeaveSummary)).Methods("GET")
	r.HandleFunc("/leaves/records", a.sessionRequired(a.handleLeaveAddRecord)).Methods("POST")
	r.HandleFunc("/leaves/records/{id}", a.sessionRequired(a.handleLeaveDeleteRecord)).Methods("DELETE")
	r.HandleFunc("/leaves/settings", a.sessionRequired(a.handleLeaveUpdateSettings)).Methods("PUT")
	r.HandleFunc("/leaves/export", a.sessionRequired(a.handleLeaveExport)).Methods("GET")
}

func (a *API) handleLeaveSummary(w http.ResponseWriter, r *http.Request) {
	summary, err := a.app.GetLeaveSummary(getUserID(r))
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}
	data, err := json.Marshal(summary)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}
	jsonBytesResponse(w, http.StatusOK, data)
}

func (a *API) handleLeaveAddRecord(w http.ResponseWriter, r *http.Request) {
	var request model.LeaveRecord
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest("invalid request body"))
		return
	}
	record, err := a.app.AddLeaveRecord(getUserID(r), request)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}
	data, _ := json.Marshal(record)
	jsonBytesResponse(w, http.StatusOK, data)
}

func (a *API) handleLeaveDeleteRecord(w http.ResponseWriter, r *http.Request) {
	if err := a.app.DeleteLeaveRecord(getUserID(r), mux.Vars(r)["id"]); err != nil {
		a.errorResponse(w, r, err)
		return
	}
	jsonStringResponse(w, http.StatusOK, "{\"ok\":true}")
}

func (a *API) handleLeaveUpdateSettings(w http.ResponseWriter, r *http.Request) {
	var request model.LeaveSettings
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		a.errorResponse(w, r, model.NewErrBadRequest("invalid request body"))
		return
	}
	settings, err := a.app.UpdateLeaveSettings(getUserID(r), request)
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}
	data, _ := json.Marshal(settings)
	jsonBytesResponse(w, http.StatusOK, data)
}

func (a *API) handleLeaveExport(w http.ResponseWriter, r *http.Request) {
	text, err := a.app.ExportLeaveText(getUserID(r))
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}
	filename := fmt.Sprintf("leave-%d.txt", time.Now().Year())
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=\""+filename+"\"")
	w.Write([]byte("\ufeff" + text))
}

func (a *API) handleTopBarLunar(w http.ResponseWriter, r *http.Request) {
	year := time.Now().Year()
	if raw := r.URL.Query().Get("year"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1901 || parsed > 2099 {
			a.errorResponse(w, r, model.NewErrBadRequest("year 需在 1901-2099"))
			return
		}
		year = parsed
	}
	data, err := json.Marshal(model.TopBarLunar{
		Year: year,
		Days: a.app.GetLunarYear(year),
	})
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}
	jsonBytesResponse(w, http.StatusOK, data)
}
