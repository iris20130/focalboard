package model

// TopBarGreeting is the content source for the workspace top bar.
type TopBarGreeting struct {
	Enabled bool     `json:"enabled"`
	Idle    []string `json:"idle"`
	Busy    []string `json:"busy"`
}
