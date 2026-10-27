package holidays

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

const (
	refreshInterval = 72 * time.Hour
	fetchTimeout    = 20 * time.Second
)

// Public mirrors first; the raw GitHub address is a last resort for networks
// that can reach GitHub but not the CDN.
var sources = []string{
	"https://fastly.jsdelivr.net/gh/NateScarlet/holiday-cn@master/%d.json",
	"https://cdn.jsdelivr.net/gh/NateScarlet/holiday-cn@master/%d.json",
	"https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/%d.json",
}

// Day is one statutory holiday or one makeup workday.
type Day struct {
	Date   string `json:"date"`
	Name   string `json:"name"`
	OffDay bool   `json:"offDay"`
}

type cacheFile struct {
	Year      int   `json:"year"`
	UpdatedAt int64 `json:"updatedAt"`
	Days      []Day `json:"days"`
}

type sourceFile struct {
	Days []sourceDay `json:"days"`
}

type sourceDay struct {
	Date     string `json:"date"`
	Name     string `json:"name"`
	IsOffDay bool   `json:"isOffDay"`
}

// Service keeps yearly PRC holiday calendars on disk, refreshing each year at
// most every three days. Requests never block on the network: stale data is
// served while a refresh runs in the background.
type Service struct {
	dir     string
	client  *http.Client
	mu      sync.Mutex
	files   map[int]*cacheFile
	loading map[int]bool
}

func New(dir string) *Service {
	service := &Service{
		dir:     dir,
		client:  &http.Client{Timeout: fetchTimeout},
		files:   map[int]*cacheFile{},
		loading: map[int]bool{},
	}
	go service.refreshLoop()
	return service
}

// refreshLoop keeps the current and next year warm so the three-day refresh
// does not depend on anyone opening a page.
func (s *Service) refreshLoop() {
	s.year(time.Now().Year())
	s.year(time.Now().Year() + 1)
	ticker := time.NewTicker(6 * time.Hour)
	defer ticker.Stop()
	for range ticker.C {
		year := time.Now().Year()
		s.year(year)
		s.year(year + 1)
	}
}

// Days returns the merged calendar for the given years, refreshing stale years
// asynchronously. Years with no cached data yet return nothing until the
// background fetch completes.
func (s *Service) Days(years ...int) []Day {
	all := make([]Day, 0, 64)
	for _, year := range years {
		cache := s.year(year)
		if cache != nil {
			all = append(all, cache.Days...)
		}
	}
	sort.Slice(all, func(i, j int) bool { return all[i].Date < all[j].Date })
	return all
}

func (s *Service) year(year int) *cacheFile {
	s.mu.Lock()
	if cache, ok := s.files[year]; ok {
		s.mu.Unlock()
		if time.Since(time.UnixMilli(cache.UpdatedAt)) >= refreshInterval {
			s.refreshAsync(year)
		}
		return cache
	}
	s.mu.Unlock()

	path := s.path(year)
	data, err := os.ReadFile(path)
	if err == nil {
		cache := &cacheFile{}
		if json.Unmarshal(data, cache) == nil && cache.Year == year {
			s.mu.Lock()
			s.files[year] = cache
			s.mu.Unlock()
			if time.Since(time.UnixMilli(cache.UpdatedAt)) >= refreshInterval {
				s.refreshAsync(year)
			}
			return cache
		}
	}

	s.refreshAsync(year)
	return nil
}

func (s *Service) path(year int) string {
	return filepath.Join(s.dir, fmt.Sprintf("%d.json", year))
}

func (s *Service) refreshAsync(year int) {
	s.mu.Lock()
	if s.loading[year] {
		s.mu.Unlock()
		return
	}
	s.loading[year] = true
	s.mu.Unlock()

	go func() {
		cache, err := s.fetch(year)
		s.mu.Lock()
		defer s.mu.Unlock()
		delete(s.loading, year)
		if err != nil {
			return
		}
		s.files[year] = cache
	}()
}

func (s *Service) fetch(year int) (*cacheFile, error) {
	var lastErr error
	for _, pattern := range sources {
		url := fmt.Sprintf(pattern, year)
		req, err := http.NewRequest(http.MethodGet, url, nil)
		if err != nil {
			lastErr = err
			continue
		}
		req.Header.Set("User-Agent", "focalboard-holiday-fetcher/1.0")
		resp, err := s.client.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		body := resp.Body
		if resp.StatusCode != http.StatusOK {
			body.Close()
			lastErr = fmt.Errorf("holiday source %s returned %d", url, resp.StatusCode)
			continue
		}
		var parsed sourceFile
		err = json.NewDecoder(body).Decode(&parsed)
		body.Close()
		if err != nil || len(parsed.Days) == 0 {
			if err != nil {
				lastErr = err
			} else {
				lastErr = fmt.Errorf("holiday source %s returned no days", url)
			}
			continue
		}
		cache := &cacheFile{Year: year, UpdatedAt: time.Now().UnixMilli(), Days: make([]Day, 0, len(parsed.Days))}
		for _, day := range parsed.Days {
			if day.Date == "" {
				continue
			}
			cache.Days = append(cache.Days, Day{Date: day.Date, Name: day.Name, OffDay: day.IsOffDay})
		}
		if len(cache.Days) == 0 {
			lastErr = fmt.Errorf("holiday source %s returned no usable days", url)
			continue
		}
		if err := s.save(cache); err != nil {
			lastErr = err
			continue
		}
		return cache, nil
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("no holiday source available")
	}
	return nil, lastErr
}

func (s *Service) save(cache *cacheFile) error {
	if err := os.MkdirAll(s.dir, 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cache, "", "  ")
	if err != nil {
		return err
	}
	tmp := s.path(cache.Year) + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, s.path(cache.Year))
}
