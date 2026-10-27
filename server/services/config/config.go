package config

import (
	"bytes"
	"log"
	"os"

	"github.com/spf13/viper"
)

const (
	DefaultServerRoot = "http://localhost:8000"
	DefaultPort       = 8000
	DBPingAttempts    = 5
)

type AmazonS3Config struct {
	AccessKeyID     string
	SecretAccessKey string
	Bucket          string
	PathPrefix      string
	Region          string
	Endpoint        string
	SSL             bool
	SignV2          bool
	SSE             bool
	Trace           bool
	Timeout         int64
}

// Configuration is the app configuration stored in a json file.
type Configuration struct {
	ServerRoot               string            `json:"serverRoot" mapstructure:"serverRoot"`
	Port                     int               `json:"port" mapstructure:"port"`
	DBType                   string            `json:"dbtype" mapstructure:"dbtype"`
	DBConfigString           string            `json:"dbconfig" mapstructure:"dbconfig"`
	DBPingAttempts           int               `json:"dbpingattempts" mapstructure:"dbpingattempts"`
	DBTablePrefix            string            `json:"dbtableprefix" mapstructure:"dbtableprefix"`
	UseSSL                   bool              `json:"useSSL" mapstructure:"useSSL"`
	SecureCookie             bool              `json:"secureCookie" mapstructure:"secureCookie"`
	WebPath                  string            `json:"webpath" mapstructure:"webpath"`
	FilesDriver              string            `json:"filesdriver" mapstructure:"filesdriver"`
	FilesS3Config            AmazonS3Config    `json:"filess3config" mapstructure:"filess3config"`
	FilesPath                string            `json:"filespath" mapstructure:"filespath"`
	MaxFileSize              int64             `json:"maxfilesize" mapstructure:"maxfilesize"`
	Telemetry                bool              `json:"telemetry" mapstructure:"telemetry"`
	TelemetryID              string            `json:"telemetryid" mapstructure:"telemetryid"`
	PrometheusAddress        string            `json:"prometheusaddress" mapstructure:"prometheusaddress"`
	WebhookUpdate            []string          `json:"webhook_update" mapstructure:"webhook_update"`
	Secret                   string            `json:"secret" mapstructure:"secret"`
	SessionExpireTime        int64             `json:"session_expire_time" mapstructure:"session_expire_time"`
	SessionRefreshTime       int64             `json:"session_refresh_time" mapstructure:"session_refresh_time"`
	LocalOnly                bool              `json:"localonly" mapstructure:"localonly"`
	EnableLocalMode          bool              `json:"enableLocalMode" mapstructure:"enableLocalMode"`
	LocalModeSocketLocation  string            `json:"localModeSocketLocation" mapstructure:"localModeSocketLocation"`
	EnablePublicSharedBoards bool              `json:"enablePublicSharedBoards" mapstructure:"enablePublicSharedBoards"`
	FeatureFlags             map[string]string `json:"featureFlags" mapstructure:"featureFlags"`
	EnableDataRetention      bool              `json:"enable_data_retention" mapstructure:"enable_data_retention"`
	DataRetentionDays        int               `json:"data_retention_days" mapstructure:"data_retention_days"`
	TeammateNameDisplay      string            `json:"teammate_name_display" mapstructure:"teammateNameDisplay"`
	ShowEmailAddress         bool              `json:"show_email_address" mapstructure:"showEmailAddress"`
	ShowFullName             bool              `json:"show_full_name" mapstructure:"showFullName"`

	AuthMode string `json:"authMode" mapstructure:"authMode"`

	LoggingCfgFile string `json:"logging_cfg_file" mapstructure:"logging_cfg_file"`
	LoggingCfgJSON string `json:"logging_cfg_json" mapstructure:"logging_cfg_json"`

	AuditCfgFile string `json:"audit_cfg_file" mapstructure:"audit_cfg_file"`
	AuditCfgJSON string `json:"audit_cfg_json" mapstructure:"audit_cfg_json"`

	NotifyFreqCardSeconds  int `json:"notify_freq_card_seconds" mapstructure:"notify_freq_card_seconds"`
	NotifyFreqBoardSeconds int `json:"notify_freq_board_seconds" mapstructure:"notify_freq_board_seconds"`

	DueReminderEnabled         bool   `json:"dueReminderEnabled" mapstructure:"dueReminderEnabled"`
	DueReminderLeadDays        int    `json:"dueReminderLeadDays" mapstructure:"dueReminderLeadDays"`
	DueReminderIntervalMinutes int    `json:"dueReminderIntervalMinutes" mapstructure:"dueReminderIntervalMinutes"`
	DueReminderFeishuWebhook   string `json:"dueReminderFeishuWebhook" mapstructure:"dueReminderFeishuWebhook"`
	DueReminderFeishuSecret    string `json:"dueReminderFeishuSecret" mapstructure:"dueReminderFeishuSecret"`

	TopBarEnabled    bool   `json:"topBarEnabled" mapstructure:"topBarEnabled"`
	TopBarQuotesFile string `json:"topBarQuotesFile" mapstructure:"topBarQuotesFile"`
}

// ReadConfigFile read the configuration from the filesystem.
func ReadConfigFile(configFilePath string) (*Configuration, error) {
	if configFilePath == "" {
		configFilePath = "./config.json"
	}
	rawConfig, err := os.ReadFile(configFilePath)
	if err != nil {
		return nil, err
	}

	viper.SetEnvPrefix("focalboard")
	viper.AutomaticEnv() // read config values from env like FOCALBOARD_SERVERROOT=...
	viper.SetDefault("ServerRoot", DefaultServerRoot)
	viper.SetDefault("DBPingAttempts", DBPingAttempts)
	viper.SetDefault("Port", DefaultPort)
	viper.SetDefault("DBType", "sqlite3")
	viper.SetDefault("DBConfigString", "./focalboard.db")
	viper.SetDefault("DBTablePrefix", "")
	viper.SetDefault("SecureCookie", false)
	viper.SetDefault("WebPath", "./pack")
	viper.SetDefault("FilesPath", "./files")
	viper.SetDefault("FilesDriver", "local")
	viper.SetDefault("Telemetry", true)
	viper.SetDefault("TelemetryID", "")
	viper.SetDefault("WebhookUpdate", nil)
	viper.SetDefault("SessionExpireTime", 60*60*24*30) // 30 days session lifetime
	viper.SetDefault("SessionRefreshTime", 60*60*5)    // 5 minutes session refresh
	viper.SetDefault("LocalOnly", false)
	viper.SetDefault("EnableLocalMode", false)
	viper.SetDefault("LocalModeSocketLocation", "/var/tmp/focalboard_local.socket")
	viper.SetDefault("EnablePublicSharedBoards", false)
	viper.SetDefault("AuthMode", "native")
	viper.SetDefault("NotifyFreqCardSeconds", 120)    // 2 minutes after last card edit
	viper.SetDefault("NotifyFreqBoardSeconds", 86400) // 1 day after last card edit
	viper.SetDefault("DueReminderEnabled", false)
	viper.SetDefault("DueReminderLeadDays", 3)
	viper.SetDefault("DueReminderIntervalMinutes", 60)
	viper.SetDefault("DueReminderFeishuWebhook", "")
	viper.SetDefault("DueReminderFeishuSecret", "")
	viper.SetDefault("TopBarEnabled", false)
	viper.SetDefault("TopBarQuotesFile", "./quotes.txt")
	viper.SetDefault("EnableDataRetention", false)
	viper.SetDefault("FeatureFlags", map[string]string{})
	viper.SetDefault("DataRetentionDays", 365) // 1 year is default
	viper.SetDefault("PrometheusAddress", "")
	viper.SetDefault("TeammateNameDisplay", "username")
	viper.SetDefault("ShowEmailAddress", false)
	viper.SetDefault("ShowFullName", false)

	viper.SetConfigType("json")
	err = viper.ReadConfig(bytes.NewReader(stripJSONComments(rawConfig)))
	if err != nil {
		return nil, err
	}

	// Bind every known key to FOCALBOARD_<KEY> so Docker (or the host shell)
	// can override config.json values with environment variables.
	for _, key := range viper.AllKeys() {
		if err := viper.BindEnv(key); err != nil {
			return nil, err
		}
	}

	configuration := Configuration{}

	err = viper.Unmarshal(&configuration)
	if err != nil {
		return nil, err
	}

	// viper's defaults use camelCase keys while mapstructure uses snake_case,
	// so session lifetimes fall back to zero when config.json omits them. A
	// zero expiry makes every session unmatchable ("no rows"), which blocks
	// first-time admin accounts behind the join-board dialog.
	if configuration.SessionExpireTime <= 0 {
		configuration.SessionExpireTime = 60 * 60 * 24 * 30
	}
	if configuration.SessionRefreshTime <= 0 {
		configuration.SessionRefreshTime = 60 * 60 * 5
	}

	log.Println("readConfigFile")
	log.Printf("%+v", removeSecurityData(configuration))

	return &configuration, nil
}

// stripJSONComments removes // and /* */ comments outside of string literals,
// so config.json can be annotated with notes while staying valid JSON.
func stripJSONComments(data []byte) []byte {
	out := make([]byte, 0, len(data))
	inString := false
	escaped := false
	for i := 0; i < len(data); i++ {
		c := data[i]
		if inString {
			out = append(out, c)
			if escaped {
				escaped = false
			} else if c == '\\' {
				escaped = true
			} else if c == '"' {
				inString = false
			}
			continue
		}
		if c == '"' {
			inString = true
			out = append(out, c)
			continue
		}
		if c == '/' && i+1 < len(data) {
			if data[i+1] == '/' {
				for i < len(data) && data[i] != '\n' {
					i++
				}
				if i < len(data) {
					out = append(out, '\n')
				}
				continue
			}
			if data[i+1] == '*' {
				i += 2
				for i+1 < len(data) && !(data[i] == '*' && data[i+1] == '/') {
					if data[i] == '\n' {
						out = append(out, '\n')
					}
					i++
				}
				i++
				continue
			}
		}
		out = append(out, c)
	}
	return out
}

func removeSecurityData(config Configuration) Configuration {
	clean := config
	return clean
}
