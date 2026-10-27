package app

import (
	"bufio"
	"os"
	"strings"

	"github.com/mattermost/focalboard/server/model"
)

const defaultTopBarQuotesFile = "./quotes.txt"

// GetTopBarGreeting returns the greeting switch and quote pools. The quotes file
// is read on every call so edits take effect after a page refresh without
// restarting the server.
func (a *App) GetTopBarGreeting() *model.TopBarGreeting {
	greeting := &model.TopBarGreeting{
		Enabled: a.config.TopBarEnabled,
		Idle:    []string{},
		Busy:    []string{},
	}
	if !greeting.Enabled {
		return greeting
	}

	path := strings.TrimSpace(a.config.TopBarQuotesFile)
	if path == "" {
		path = defaultTopBarQuotesFile
	}
	greeting.Idle, greeting.Busy = readTopBarQuotes(path)
	return greeting
}

func readTopBarQuotes(path string) ([]string, []string) {
	idle := []string{}
	busy := []string{}

	file, err := os.Open(path)
	if err != nil {
		return idle, busy
	}
	defer file.Close()

	section := "idle"
	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 1024), 256*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "//") {
			continue
		}
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			switch strings.ToLower(strings.Trim(line, "[] ")) {
			case "idle", "闲", "空闲":
				section = "idle"
			case "busy", "忙", "忙碌":
				section = "busy"
			default:
				section = ""
			}
			continue
		}
		switch section {
		case "idle":
			idle = append(idle, line)
		case "busy":
			busy = append(busy, line)
		}
	}
	return idle, busy
}
