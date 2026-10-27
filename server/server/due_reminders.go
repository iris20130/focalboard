package server

import (
	"strconv"
	"strings"
	"time"

	"github.com/mattermost/focalboard/server/model"

	"github.com/mattermost/mattermost/server/public/shared/mlog"
)

const dueReminderLastRunPrefix = "dueReminderLastRun:"
const dueReminderDailyDonePrefix = "dueReminderDailyDone:"

// weekdayAllowed checks the account's "1,2,3,4,5" style day list (Mon=1..Sun=7).
func weekdayAllowed(days string, now time.Time) bool {
	day := int(now.Weekday())
	if day == 0 {
		day = 7 // Sunday
	}
	for _, part := range strings.Split(days, ",") {
		if d, err := strconv.Atoi(strings.TrimSpace(part)); err == nil && d == day {
			return true
		}
	}
	return false
}

// withinWindow checks the inclusive hour window, e.g. 9..17.
func withinWindow(start, end int, now time.Time) bool {
	h := now.Hour()
	if start <= end {
		return h >= start && h <= end
	}
	// overnight window, e.g. 20..6
	return h >= start || h <= end
}

// sendDueReminders runs once a minute. Every account decides its own channel,
// webhook, day list, time window and check mode (interval vs daily fixed time).
func (s *Server) sendDueReminders() {
	users, err := s.store.GetUsersByTeam(model.GlobalTeamID, "", false, false)
	if err != nil {
		s.logger.Error("Unable to list users for due reminders", mlog.Err(err))
		return
	}

	now := time.Now()
	for _, user := range users {
		settings, _, settingsErr := s.app.GetDueReminderSettings(user.ID)
		if settingsErr != nil {
			s.logger.Error("Unable to read due reminder settings", mlog.String("userID", user.ID), mlog.Err(settingsErr))
			continue
		}
		if !settings.Enabled || settings.Webhook == "" {
			continue
		}
		if !weekdayAllowed(settings.Days, now) || !withinWindow(settings.WindowStart, settings.WindowEnd, now) {
			continue
		}

		if settings.Mode == "daily" {
			dailyKey := dueReminderDailyDonePrefix + user.ID
			doneMarker := now.Format("2006-01-02") + " " + settings.DailyTime
			if stored, storedErr := s.store.GetSystemSetting(dailyKey); storedErr == nil && stored == doneMarker {
				continue
			}
			// only fire when now >= today's fixed time
			fixed, parseErr := time.Parse("15:04", settings.DailyTime)
			if parseErr != nil {
				continue
			}
			if now.Hour()*60+now.Minute() < fixed.Hour()*60+fixed.Minute() {
				continue
			}

			count, sendErr := s.app.SendDueRemindersForUser(user.ID, user.Username, settings, false)
			if sendErr != nil {
				s.logger.Error("Unable to send due reminder",
					mlog.String("userID", user.ID),
					mlog.String("username", user.Username),
					mlog.Err(sendErr),
				)
				continue
			}
			if setErr := s.store.SetSystemSetting(dailyKey, doneMarker); setErr != nil {
				s.logger.Warn("Unable to persist due reminder daily state", mlog.String("userID", user.ID), mlog.Err(setErr))
			}
			if count > 0 {
				s.logger.Info("Due reminders sent (daily)",
					mlog.String("userID", user.ID),
					mlog.String("username", user.Username),
					mlog.Int("count", count),
				)
			}
			continue
		}

		lastRunKey := dueReminderLastRunPrefix + user.ID
		if stored, storedErr := s.store.GetSystemSetting(lastRunKey); storedErr == nil && stored != "" {
			if lastRun, parseErr := strconv.ParseInt(stored, 10, 64); parseErr == nil {
				if now.Sub(time.UnixMilli(lastRun)) < time.Duration(settings.IntervalMinutes)*time.Minute {
					continue
				}
			}
		}

		count, sendErr := s.app.SendDueRemindersForUser(user.ID, user.Username, settings, false)
		if sendErr != nil {
			s.logger.Error("Unable to send due reminder",
				mlog.String("userID", user.ID),
				mlog.String("username", user.Username),
				mlog.Err(sendErr),
			)
			continue
		}

		if setErr := s.store.SetSystemSetting(lastRunKey, strconv.FormatInt(now.UnixMilli(), 10)); setErr != nil {
			s.logger.Warn("Unable to persist due reminder run time", mlog.String("userID", user.ID), mlog.Err(setErr))
		}
		if count > 0 {
			s.logger.Info("Due reminders sent",
				mlog.String("userID", user.ID),
				mlog.String("username", user.Username),
				mlog.Int("count", count),
			)
		}
	}
}
