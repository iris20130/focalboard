package model

// TopBarHoliday is a single statutory holiday or makeup workday.
type TopBarHoliday struct {
	Date   string `json:"date"`
	Name   string `json:"name"`
	OffDay bool   `json:"offDay"`
}

type TopBarNextHoliday struct {
	Date      string `json:"date"`
	Name      string `json:"name"`
	DaysUntil int    `json:"daysUntil"`
}

// TopBarCalendar carries the calendar information shown after the top bar
// quote plus the holiday calendar used by the board calendar view.
type TopBarCalendar struct {
	Date         string            `json:"date"`
	DayOfYear    int               `json:"dayOfYear"`
	DaysInYear   int               `json:"daysInYear"`
	Weekday      string            `json:"weekday"`
	Lunar        string            `json:"lunar"`
	TodayHoliday *TopBarHoliday    `json:"todayHoliday,omitempty"`
	NextHoliday  *TopBarNextHoliday `json:"nextHoliday,omitempty"`
	Days         []TopBarHoliday   `json:"days"`
}

// LunarDay is one day of the per-year lunar/solar-term table used by the
// leave calendar popup and the board calendar view.
type LunarDay struct {
	Date  string `json:"date"`
	Lunar string `json:"lunar"`
	Term  string `json:"term,omitempty"`
}

// TopBarLunar is the response of GET /api/v2/top-bar/lunar.
type TopBarLunar struct {
	Year int        `json:"year"`
	Days []LunarDay `json:"days"`
}
