package api

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/mux"
)

func (a *API) registerTopBarRoutes(r *mux.Router) {
	r.HandleFunc("/top-bar", a.sessionRequired(a.handleGetTopBarGreeting)).Methods("GET")
	r.HandleFunc("/top-bar/calendar", a.sessionRequired(a.handleGetTopBarCalendar)).Methods("GET")
	r.HandleFunc("/top-bar/lunar", a.sessionRequired(a.handleTopBarLunar)).Methods("GET")
}

func (a *API) handleGetTopBarCalendar(w http.ResponseWriter, r *http.Request) {
	data, err := json.Marshal(a.app.GetTopBarCalendar())
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}
	jsonBytesResponse(w, http.StatusOK, data)
}

func (a *API) handleGetTopBarGreeting(w http.ResponseWriter, r *http.Request) {
	data, err := json.Marshal(a.app.GetTopBarGreeting())
	if err != nil {
		a.errorResponse(w, r, err)
		return
	}
	jsonBytesResponse(w, http.StatusOK, data)
}
