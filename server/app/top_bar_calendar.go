package app

import (
	"fmt"
	"time"

	lunarcalendar "github.com/6tail/lunar-go/calendar"

	"github.com/mattermost/focalboard/server/model"
)

var chineseWeekdays = [...]string{"星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"}

// GetTopBarCalendar returns today's day-of-year, weekday and lunar date plus
// the nearby statutory holidays. Holiday data is served from the on-disk cache
// and refreshed in the background when older than three days.
func (a *App) GetTopBarCalendar() *model.TopBarCalendar {
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())

	calendar := &model.TopBarCalendar{
		Date:       today.Format("2006-01-02"),
		DayOfYear:  today.YearDay(),
		DaysInYear: daysInYear(today.Year()),
		Weekday:    chineseWeekdays[int(today.Weekday())],
		Lunar:      lunarText(today),
		Days:       []model.TopBarHoliday{},
	}
	if a.holidays == nil {
		return calendar
	}

	raw := a.holidays.Days(today.Year(), today.Year()+1)
	for _, day := range raw {
		calendar.Days = append(calendar.Days, model.TopBarHoliday{Date: day.Date, Name: day.Name, OffDay: day.OffDay})
	}

	for _, day := range calendar.Days {
		if day.Date != calendar.Date {
			continue
		}
		todayHoliday := day
		calendar.TodayHoliday = &todayHoliday
		break
	}
	for _, day := range calendar.Days {
		if !day.OffDay || day.Date < calendar.Date {
			continue
		}
		holidayDate, err := time.ParseInLocation("2006-01-02", day.Date, now.Location())
		if err != nil {
			continue
		}
		calendar.NextHoliday = &model.TopBarNextHoliday{
			Date:      day.Date,
			Name:      day.Name,
			DaysUntil: int(holidayDate.Sub(today).Hours() / 24),
		}
		break
	}
	return calendar
}

func lunarText(day time.Time) string {
	lunar := lunarcalendar.NewSolarFromYmd(day.Year(), int(day.Month()), day.Day()).GetLunar()
	return fmt.Sprintf("%s（%s）年%s月%s", lunar.GetYearInGanZhi(), lunar.GetYearShengXiao(), lunar.GetMonthInChinese(), lunar.GetDayInChinese())
}

func daysInYear(year int) int {
	return time.Date(year, 12, 31, 0, 0, 0, 0, time.Local).YearDay()
}
