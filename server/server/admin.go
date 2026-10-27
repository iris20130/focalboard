package server

import (
	"strings"

	"github.com/mattermost/focalboard/server/model"
)

// ensureAdminAssigned makes sure the workspace has an administrator. The
// first registered account becomes the administrator.
func ensureAdminAssigned(store interface {
	GetSystemSetting(key string) (string, error)
	SetSystemSetting(key, value string) error
	GetRegisteredUserCount() (int, error)
	GetUserByUsername(username string) (*model.User, error)
	GetUsersByTeam(teamID string, asGuestID string, showEmail, showName bool) ([]*model.User, error)
}) error {
	adminID, err := store.GetSystemSetting(model.SystemAdminUserIDKey)
	if err != nil {
		return err
	}
	if strings.TrimSpace(adminID) != "" {
		return nil
	}

	// Use the first account in the workspace, if any.
	users, listErr := store.GetUsersByTeam(model.GlobalTeamID, "", false, false)
	if listErr != nil {
		return listErr
	}
	if len(users) == 0 {
		return nil
	}
	first := users[0]
	for _, user := range users {
		if user.CreateAt < first.CreateAt {
			first = user
		}
	}
	return store.SetSystemSetting(model.SystemAdminUserIDKey, first.ID)
}
