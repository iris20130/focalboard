// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/mattermost/focalboard/server/model"
	"github.com/mattermost/focalboard/server/utils"
)

const (
	leaveRecordsPref  = "leaveRecords"
	leaveSettingsPref = "leaveSettings"

	leaveAutoGrantNote = "系统自动发放"
)

// leaveDateLayout is the canonical YYYY-MM-DD format for the leave ledger.
const leaveDateLayout = "2006-01-02"

func defaultLeaveSettings() model.LeaveSettings {
	return model.LeaveSettings{
		AnnualExpireYears: 1,
		AnnualExpireMonth: 3,
		AnnualExpireDay:   31,
		CompExpireYears:   1,
		CompExpireMonth:   4,
		CompExpireDay:     30,
	}
}

func (a *App) getLeaveData(userID string) ([]model.LeaveRecord, model.LeaveSettings, error) {
	preferences, err := a.GetUserPreferences(userID)
	if err != nil {
		return nil, defaultLeaveSettings(), err
	}
	records := []model.LeaveRecord{}
	settings := defaultLeaveSettings()
	for _, p := range preferences {
		switch p.Name {
		case leaveRecordsPref:
			if p.Value != "" {
				if err := json.Unmarshal([]byte(p.Value), &records); err != nil {
					return nil, settings, fmt.Errorf("假勤记录数据损坏，无法解析")
				}
			}
		case leaveSettingsPref:
			if p.Value != "" {
				if err := json.Unmarshal([]byte(p.Value), &settings); err != nil {
					return nil, settings, fmt.Errorf("假勤设置数据损坏，无法解析")
				}
			}
		}
	}
	if settings.AnnualExpireYears < 0 || settings.AnnualExpireYears > 10 {
		settings.AnnualExpireYears = 1
	}
	if settings.CompExpireYears < 0 || settings.CompExpireYears > 10 {
		settings.CompExpireYears = 1
	}
	if settings.AnnualExpireMonth < 1 || settings.AnnualExpireMonth > 12 {
		settings.AnnualExpireMonth = 3
	}
	if settings.AnnualExpireDay < 1 || settings.AnnualExpireDay > 31 {
		settings.AnnualExpireDay = 31
	}
	if settings.CompExpireMonth < 1 || settings.CompExpireMonth > 12 {
		settings.CompExpireMonth = 4
	}
	if settings.CompExpireDay < 1 || settings.CompExpireDay > 31 {
		settings.CompExpireDay = 30
	}
	return records, settings, nil
}

func (a *App) saveLeaveRecords(userID string, records []model.LeaveRecord) error {
	if records == nil {
		records = []model.LeaveRecord{}
	}
	data, err := json.Marshal(records)
	if err != nil {
		return err
	}
	_, err = a.UpdateUserConfig(userID, model.UserPreferencesPatch{
		UpdatedFields: map[string]string{leaveRecordsPref: string(data)},
	})
	return err
}

func (a *App) saveLeaveSettings(userID string, settings model.LeaveSettings) error {
	data, err := json.Marshal(settings)
	if err != nil {
		return err
	}
	_, err = a.UpdateUserConfig(userID, model.UserPreferencesPatch{
		UpdatedFields: map[string]string{leaveSettingsPref: string(data)},
	})
	return err
}

// annualLeaveDays implements the Chinese statutory tiers: full 20 years of
// seniority gets 15 days, 10-20 years gets 10, 1-10 years gets 5, below 1
// year gets nothing.
func annualLeaveDays(seniorityYears int) float64 {
	switch {
	case seniorityYears >= 20:
		return 15
	case seniorityYears >= 10:
		return 10
	case seniorityYears >= 1:
		return 5
	default:
		return 0
	}
}

func parseLeaveDate(value string) (time.Time, error) {
	return time.ParseInLocation(leaveDateLayout, value, time.Local)
}

// expireOn is the clear date for days accumulated in calendar year cumYear:
// cumYear+years on the configured month/day, clamped to the month length.
func expireOn(cumYear, years, month, day int) string {
	if day > 28 {
		switch month {
		case 2:
			day = 28
		case 4, 6, 9, 11:
			day = 30
		}
	}
	return fmt.Sprintf("%04d-%02d-%02d", cumYear+years, month, day)
}

// weekdayUntil counts Mon-Fri days after today up to and including deadline.
func weekdayUntil(today, deadline string) int {
	start, err1 := parseLeaveDate(today)
	end, err2 := parseLeaveDate(deadline)
	if err1 != nil || err2 != nil || end.Before(start) {
		return 0
	}
	count := 0
	for d := start.AddDate(0, 0, 1); !d.After(end); d = d.AddDate(0, 0, 1) {
		if wd := d.Weekday(); wd != time.Saturday && wd != time.Sunday {
			count++
		}
	}
	return count
}

// nextClearDate is the upcoming configured clear date for a kind: the first
// (cumYear+years)-MD after today, walking forward from this year's batch.
func nextClearDate(now time.Time, years, month, day int) string {
	today := now.Format(leaveDateLayout)
	for cum := now.Year(); cum <= now.Year()+11; cum++ {
		if c := expireOn(cum, years, month, day); c > today {
			return c
		}
	}
	return expireOn(now.Year()+1, years, month, day)
}

// seniorityYearsAt returns whole years of work between the work start date and
// the reference date.
func seniorityYearsAt(workStart, ref time.Time) int {
	years := ref.Year() - workStart.Year()
	if ref.Month() < workStart.Month() || (ref.Month() == workStart.Month() && ref.Day() < workStart.Day()) {
		years--
	}
	if years < 0 {
		return 0
	}
	return years
}

// ensureAnnualGrant appends the January 1 entitlement for the current year
// when the user has a work start date and the tier is non-zero. Tier changes
// mid-year never adjust the current grant (decided 2026-10-25).
func ensureAnnualGrant(records []model.LeaveRecord, settings model.LeaveSettings, now time.Time) ([]model.LeaveRecord, bool) {
	if settings.WorkStartDate == "" {
		return records, false
	}
	workStart, err := parseLeaveDate(settings.WorkStartDate)
	if err != nil {
		return records, false
	}
	grantDate := fmt.Sprintf("%d-01-01", now.Year())
	expectedExpiry := expireOn(now.Year(), settings.AnnualExpireYears, settings.AnnualExpireMonth, settings.AnnualExpireDay)
	for i, r := range records {
		if r.Kind == model.LeaveKindAnnual && r.Action == model.LeaveActionGrant && r.Date == grantDate {
			// self-heal legacy expiry computed under the old month-based rule
			if r.Note == leaveAutoGrantNote && r.Expires != expectedExpiry {
				records[i].Expires = expectedExpiry
				return records, true
			}
			return records, false
		}
	}
	days := annualLeaveDays(seniorityYearsAt(workStart, time.Date(now.Year(), time.January, 1, 0, 0, 0, 0, now.Location())))
	if days == 0 {
		return records, false
	}
	records = append(records, model.LeaveRecord{
		ID:        utils.NewID(utils.IDTypeNone),
		Kind:      model.LeaveKindAnnual,
		Action:    model.LeaveActionGrant,
		Date:      grantDate,
		Days:      days,
		Note:      leaveAutoGrantNote,
		Expires:   expireOn(now.Year(), settings.AnnualExpireYears, settings.AnnualExpireMonth, settings.AnnualExpireDay),
		CreatedAt: utils.GetMillis(),
	})
	return records, true
}

// leaveAllocation runs FIFO consumption (earliest expiry first) over the whole
// ledger and returns per-grant allocated days plus per-kind balances.
func leaveAllocation(records []model.LeaveRecord, today string) (map[string]float64, map[string]*model.LeaveBalance) {
	allocated := map[string]float64{}
	balances := map[string]*model.LeaveBalance{
		model.LeaveKindAnnual: {Kind: model.LeaveKindAnnual},
		model.LeaveKindComp:   {Kind: model.LeaveKindComp},
	}

	for _, kind := range []string{model.LeaveKindAnnual, model.LeaveKindComp} {
		var grants []model.LeaveRecord
		var uses []model.LeaveRecord
		for _, r := range records {
			if r.Kind != kind {
				continue
			}
			switch r.Action {
			case model.LeaveActionGrant, model.LeaveActionAdd:
				grants = append(grants, r)
			case model.LeaveActionUse:
				uses = append(uses, r)
			}
		}
		sort.Slice(grants, func(i, j int) bool {
			if grants[i].Expires != grants[j].Expires {
				return grants[i].Expires < grants[j].Expires
			}
			return grants[i].Date < grants[j].Date
		})
		sort.Slice(uses, func(i, j int) bool { return uses[i].Date < uses[j].Date })

		remaining := make([]float64, len(grants))
		for i, g := range grants {
			remaining[i] = g.Days
		}
		for _, u := range uses {
			want := u.Days
			// consume grants that were still valid on the use date, oldest expiry first
			for pass := 0; pass < 2 && want > 1e-9; pass++ {
				for i, g := range grants {
					if remaining[i] <= 1e-9 {
						continue
					}
					if pass == 0 && g.Expires <= u.Date {
						continue
					}
					take := math.Min(remaining[i], want)
					remaining[i] -= take
					want -= take
					allocated[g.ID] += take
				}
			}
		}
		for i, g := range grants {
			b := balances[kind]
			if g.Expires > today {
				b.Total += g.Days
				b.Used += g.Days - remaining[i]
				b.Available += remaining[i]
			} else {
				b.Expired += remaining[i]
				b.Used += g.Days - remaining[i]
			}
		}
	}
	return allocated, balances
}

// GetLeaveSummary returns balances and the current-period ledger. Expired
// remainders are surfaced as synthesized void rows.
func (a *App) GetLeaveSummary(userID string) (*model.LeaveSummary, error) {
	records, settings, err := a.getLeaveData(userID)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	today := now.Format(leaveDateLayout)
	if updated, changed := ensureAnnualGrant(records, settings, now); changed {
		records = updated
		if err := a.saveLeaveRecords(userID, records); err != nil {
			return nil, err
		}
	}
	allocated, balances := leaveAllocation(records, today)

	yearStart := fmt.Sprintf("%d-01-01", now.Year())
	display := []model.LeaveRecord{}
	for _, r := range records {
		isGrant := r.Action == model.LeaveActionGrant || r.Action == model.LeaveActionAdd
		if r.Date >= yearStart || (isGrant && r.Expires > today) {
			display = append(display, r)
		}
	}
	for _, r := range records {
		if r.Action != model.LeaveActionGrant && r.Action != model.LeaveActionAdd {
			continue
		}
		if r.Expires > today {
			continue
		}
		leftover := r.Days - allocated[r.ID]
		if leftover > 1e-9 {
			display = append(display, model.LeaveRecord{
				ID:     "void:" + r.ID,
				Kind:   r.Kind,
				Action: model.LeaveActionVoid,
				Date:   r.Expires,
				Days:   roundHalf(leftover),
			})
		}
	}
	sort.Slice(display, func(i, j int) bool {
		if display[i].Date != display[j].Date {
			return display[i].Date < display[j].Date
		}
		return display[i].CreatedAt < display[j].CreatedAt
	})

	allocRemaining := map[string]string{} // kind -> earliest unexpired grant expiry with leftover
	for _, r := range records {
		if r.Action != model.LeaveActionGrant && r.Action != model.LeaveActionAdd {
			continue
		}
		if r.Expires > today && r.Days-allocated[r.ID] > 1e-9 {
			cur, ok := allocRemaining[r.Kind]
			if !ok || r.Expires < cur {
				allocRemaining[r.Kind] = r.Expires
			}
		}
	}
	for _, b := range balances {
		years, month, day := settings.AnnualExpireYears, settings.AnnualExpireMonth, settings.AnnualExpireDay
		if b.Kind == model.LeaveKindComp {
			years, month, day = settings.CompExpireYears, settings.CompExpireMonth, settings.CompExpireDay
		}
		b.NextExpire = nextClearDate(now, years, month, day)
		if first, ok := allocRemaining[b.Kind]; ok && first < b.NextExpire {
			b.NextExpire = first
		}
		b.ExpireWorkdays = weekdayUntil(today, b.NextExpire)
	}

	list := []model.LeaveBalance{*balances[model.LeaveKindAnnual], *balances[model.LeaveKindComp]}
	return &model.LeaveSummary{
		Settings:  settings,
		Balances:  list,
		Records:   display,
	}, nil
}

func roundHalf(v float64) float64 {
	return math.Round(v*2) / 2
}

// AddLeaveRecord validates and appends one ledger entry. Annual leave can be
// granted manually or used; comp leave can be added (overtime) or used.
func (a *App) AddLeaveRecord(userID string, rec model.LeaveRecord) (*model.LeaveRecord, error) {
	if _, err := parseLeaveDate(rec.Date); err != nil || rec.Date < "2000-01-01" || rec.Date > "2100-12-31" {
		return nil, model.NewErrBadRequest("日期格式应为 YYYY-MM-DD")
	}
	if math.Abs(rec.Days*2-math.Round(rec.Days*2)) > 1e-9 || rec.Days <= 0 || rec.Days > 365 {
		return nil, model.NewErrBadRequest("天数必须为 0.5 的正倍数")
	}
	rec.Days = roundHalf(rec.Days)
	rec.Note = strings.TrimSpace(rec.Note)
	if len(rec.Note) > 100 {
		return nil, model.NewErrBadRequest("备注过长（最多 100 字）")
	}

	records, settings, err := a.getLeaveData(userID)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	if updated, changed := ensureAnnualGrant(records, settings, now); changed {
		records = updated
	}

	switch rec.Action {
	case model.LeaveActionAdd:
		year, _ := strconv.Atoi(rec.Date[:4])
		if rec.Kind == model.LeaveKindAnnual {
			// manual annual grant: stored as grant, cleared per annual rule
			rec.Action = model.LeaveActionGrant
			rec.Expires = expireOn(year, settings.AnnualExpireYears, settings.AnnualExpireMonth, settings.AnnualExpireDay)
		} else if rec.Kind == model.LeaveKindComp {
			rec.Expires = expireOn(year, settings.CompExpireYears, settings.CompExpireMonth, settings.CompExpireDay)
		} else {
			return nil, model.NewErrBadRequest("未知假期类型")
		}
		if rec.Expires <= rec.Date {
			return nil, model.NewErrBadRequest("清零日期（" + rec.Expires + "）不晚于累积日期，请调整清零年数或月日")
		}
	case model.LeaveActionUse:
		if rec.Kind != model.LeaveKindAnnual && rec.Kind != model.LeaveKindComp {
			return nil, model.NewErrBadRequest("未知假期类型")
		}
		today := now.Format(leaveDateLayout)
		_, balances := leaveAllocation(records, today)
		if balances[rec.Kind].Available+1e-9 < rec.Days {
			label := "年假"
			if rec.Kind == model.LeaveKindComp {
				label = "调休"
			}
			return nil, model.NewErrBadRequest(fmt.Sprintf("%s余额不足（剩 %g 天）", label, roundHalf(balances[rec.Kind].Available)))
		}
	default:
		return nil, model.NewErrBadRequest("只能记录增加或消耗")
	}

	rec.ID = utils.NewID(utils.IDTypeNone)
	rec.CreatedAt = utils.GetMillis()
	records = append(records, rec)
	if err := a.saveLeaveRecords(userID, records); err != nil {
		return nil, err
	}
	return &rec, nil
}

// DeleteLeaveRecord removes an entry (e.g. a mistaken record).
func (a *App) DeleteLeaveRecord(userID, id string) error {
	if id == "" {
		return model.NewErrBadRequest("缺少记录 id")
	}
	records, _, err := a.getLeaveData(userID)
	if err != nil {
		return err
	}
	out := records[:0:0]
	found := false
	for _, r := range records {
		if r.ID == id {
			found = true
			continue
		}
		out = append(out, r)
	}
	if !found {
		return model.NewErrNotFound("记录不存在")
	}
	return a.saveLeaveRecords(userID, out)
}

// UpdateLeaveSettings stores seniority/expiry/colors. Changing the work start
// date re-derives the current year's automatic grant on next read.
func (a *App) UpdateLeaveSettings(userID string, settings model.LeaveSettings) (model.LeaveSettings, error) {
	settings.WorkStartDate = strings.TrimSpace(settings.WorkStartDate)
	if settings.WorkStartDate != "" {
		if _, err := parseLeaveDate(settings.WorkStartDate); err != nil {
			return settings, model.NewErrBadRequest("参加工作日期格式应为 YYYY-MM-DD")
		}
	}
	def := defaultLeaveSettings()
	if settings.AnnualExpireYears < 0 || settings.AnnualExpireYears > 10 {
		settings.AnnualExpireYears = def.AnnualExpireYears
	}
	if settings.CompExpireYears < 0 || settings.CompExpireYears > 10 {
		settings.CompExpireYears = def.CompExpireYears
	}
	if settings.AnnualExpireMonth < 1 || settings.AnnualExpireMonth > 12 {
		settings.AnnualExpireMonth = def.AnnualExpireMonth
	}
	if settings.AnnualExpireDay < 1 || settings.AnnualExpireDay > 31 {
		settings.AnnualExpireDay = def.AnnualExpireDay
	}
	if settings.CompExpireMonth < 1 || settings.CompExpireMonth > 12 {
		settings.CompExpireMonth = def.CompExpireMonth
	}
	if settings.CompExpireDay < 1 || settings.CompExpireDay > 31 {
		settings.CompExpireDay = def.CompExpireDay
	}
	colors := map[string]string{}
	for k, v := range settings.Colors {
		if (k == "overtime" || k == "compLeave" || k == "annualLeave" || k == "term") && strings.HasPrefix(v, "#") && len(v) == 7 {
			colors[k] = v
		}
	}
	settings.Colors = colors

	_, oldSettings, err := a.getLeaveData(userID)
	if err != nil {
		return settings, err
	}
	if err := a.saveLeaveSettings(userID, settings); err != nil {
		return settings, err
	}
	if oldSettings.WorkStartDate != settings.WorkStartDate {
		records, _, err := a.getLeaveData(userID)
		if err != nil {
			return settings, err
		}
		year := time.Now().Format("2006")
		out := []model.LeaveRecord{}
		for _, r := range records {
			if r.Kind == model.LeaveKindAnnual && r.Action == model.LeaveActionGrant && strings.HasPrefix(r.Date, year) && r.Note == leaveAutoGrantNote {
				continue
			}
			out = append(out, r)
		}
		if err := a.saveLeaveRecords(userID, out); err != nil {
			return settings, err
		}
	}
	return settings, nil
}

// ExportLeaveText renders the current-period ledger as a plain-text report.
func (a *App) ExportLeaveText(userID string) (string, error) {
	summary, err := a.GetLeaveSummary(userID)
	if err != nil {
		return "", err
	}
	var b strings.Builder
	b.WriteString("假勤记录（当前周期）\r\n")
	b.WriteString(fmt.Sprintf("导出时间：%s\r\n", time.Now().Format("2006-01-02 15:04")))
	if summary.Settings.WorkStartDate != "" {
		b.WriteString(fmt.Sprintf("参加工作日期：%s\r\n", summary.Settings.WorkStartDate))
	}
	for _, bal := range summary.Balances {
		label := "年假"
		if bal.Kind == model.LeaveKindComp {
			label = "调休"
		}
		b.WriteString(fmt.Sprintf("%s：发放/增加 %g 天，已用 %g 天，剩余 %g 天，作废 %g 天\r\n", label, bal.Total, bal.Used, bal.Available, bal.Expired))
	}
	b.WriteString("\r\n日期          类型        变动      余额(年假/调休)   备注\r\n")
	annRun, compRun := 0.0, 0.0
	actionLabels := map[string]string{
		model.LeaveActionGrant: "发放",
		model.LeaveActionAdd:   "加班",
		model.LeaveActionUse:   "消耗",
		model.LeaveActionVoid:  "作废",
	}
	for _, r := range summary.Records {
		kindLabel := "年假"
		if r.Kind == model.LeaveKindComp {
			kindLabel = "调休"
		}
		delta := r.Days
		sign := "+"
		if r.Action == model.LeaveActionUse || r.Action == model.LeaveActionVoid {
			delta = -r.Days
			sign = "-"
		}
		if r.Kind == model.LeaveKindAnnual {
			annRun += delta
		} else {
			compRun += delta
		}
		b.WriteString(fmt.Sprintf("%-14s%-12s%s%-9g%-18s%s\r\n",
			r.Date, kindLabel+actionLabels[r.Action], sign, math.Abs(delta),
			fmt.Sprintf("%g/%g", roundHalf(annRun), roundHalf(compRun)), r.Note))
	}
	return b.String(), nil
}
