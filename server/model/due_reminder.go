package model

// DueCard is a card that is due soon or overdue.
type DueCard struct {
	TeamID          string            `json:"teamId"`
	BoardID         string            `json:"boardId"`
	BoardTitle      string            `json:"boardTitle"`
	BoardIcon       string            `json:"boardIcon"`
	CardID          string            `json:"cardId"`
	CardTitle       string            `json:"cardTitle"`
	DuePropertyName string            `json:"duePropertyName"`
	DueAt           int64             `json:"dueAt"`
	DaysUntilDue    int               `json:"daysUntilDue"`
	Status          string            `json:"status"` // overdue | today | soon
	Properties      map[string]string `json:"properties,omitempty"`
}
