// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package app

import (
	"sync"
	"time"

	lunarcalendar "github.com/6tail/lunar-go/calendar"

	"github.com/mattermost/focalboard/server/model"
)

var standardJieQi = map[string]bool{
	"立春": true, "雨水": true, "惊蛰": true, "春分": true, "清明": true, "谷雨": true,
	"立夏": true, "小满": true, "芒种": true, "夏至": true, "小暑": true, "大暑": true,
	"立秋": true, "处暑": true, "白露": true, "秋分": true, "寒露": true, "霜降": true,
	"立冬": true, "小雪": true, "大雪": true, "冬至": true, "小寒": true, "大寒": true,
}

var lunarYearCache sync.Map // year -> []model.LunarDay

// GetLunarYear returns the lunar day label and solar-term name for every day
// of the given year. Results are pure calendar math and cached forever.
func (a *App) GetLunarYear(year int) []model.LunarDay {
	if cached, ok := lunarYearCache.Load(year); ok {
		return cached.([]model.LunarDay)
	}
	days := make([]model.LunarDay, 0, 366)
	end := time.Date(year+1, 1, 1, 0, 0, 0, 0, time.Local)
	for t := time.Date(year, 1, 1, 0, 0, 0, 0, time.Local); t.Before(end); t = t.AddDate(0, 0, 1) {
		lunar := lunarcalendar.NewSolarFromYmd(t.Year(), int(t.Month()), t.Day()).GetLunar()
		entry := model.LunarDay{Date: t.Format("2006-01-02")}
		if jq := lunar.GetJieQi(); standardJieQi[jq] {
			entry.Term = jq
		}
		if lunar.GetDay() == 1 {
			entry.Lunar = lunar.GetMonthInChinese() + "月"
		} else {
			entry.Lunar = lunar.GetDayInChinese()
		}
		days = append(days, entry)
	}
	actual, _ := lunarYearCache.LoadOrStore(year, days)
	return actual.([]model.LunarDay)
}
