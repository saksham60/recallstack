package config

import (
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

const (
	defaultPort                    = 8080
	defaultMaxRoomParticipants     = 10
	defaultMaxActiveRooms          = 1000
	defaultMaxHTTPBodyBytes        = 4 << 20
	defaultMaxWSMessageBytes       = 256 << 10
	defaultMaxRoomOperations       = 2000
	defaultMaxRecentOperationIDs   = 4000
	defaultMaxClientSendQueue      = 128
	defaultMaxClientMessagesPerSec = 120
)

type Config struct {
	Port                       int
	LogLevel                   slog.Level
	AllowedOrigins             map[string]struct{}
	MaxRoomParticipants        int
	MaxActiveRooms             int
	RoomIdleTTL                time.Duration
	RoomMaxTTL                 time.Duration
	RoomCleanupInterval        time.Duration
	MaxHTTPBodyBytes           int64
	MaxWSMessageBytes          int64
	MaxRoomOperations          int
	MaxRecentOperationIDs      int
	MaxClientSendQueue         int
	MaxClientMessagesPerSecond int
	WSPingInterval             time.Duration
	WSPongTimeout              time.Duration
	WSWriteTimeout             time.Duration
	ShutdownTimeout            time.Duration
}

func Load() (Config, error) {
	cfg := Config{
		Port:                       defaultPort,
		LogLevel:                   slog.LevelInfo,
		MaxRoomParticipants:        defaultMaxRoomParticipants,
		MaxActiveRooms:             defaultMaxActiveRooms,
		RoomIdleTTL:                30 * time.Minute,
		RoomMaxTTL:                 4 * time.Hour,
		RoomCleanupInterval:        30 * time.Second,
		MaxHTTPBodyBytes:           defaultMaxHTTPBodyBytes,
		MaxWSMessageBytes:          defaultMaxWSMessageBytes,
		MaxRoomOperations:          defaultMaxRoomOperations,
		MaxRecentOperationIDs:      defaultMaxRecentOperationIDs,
		MaxClientSendQueue:         defaultMaxClientSendQueue,
		MaxClientMessagesPerSecond: defaultMaxClientMessagesPerSec,
		WSPingInterval:             20 * time.Second,
		WSPongTimeout:              10 * time.Second,
		WSWriteTimeout:             10 * time.Second,
		ShutdownTimeout:            10 * time.Second,
	}

	var err error
	if cfg.Port, err = envInt("PORT", cfg.Port); err != nil {
		return Config{}, err
	}
	if cfg.MaxRoomParticipants, err = envInt("MAX_ROOM_PARTICIPANTS", cfg.MaxRoomParticipants); err != nil {
		return Config{}, err
	}
	if cfg.MaxActiveRooms, err = envInt("MAX_ACTIVE_ROOMS", cfg.MaxActiveRooms); err != nil {
		return Config{}, err
	}
	if cfg.MaxHTTPBodyBytes, err = envInt64("MAX_HTTP_BODY_BYTES", cfg.MaxHTTPBodyBytes); err != nil {
		return Config{}, err
	}
	if cfg.MaxWSMessageBytes, err = envInt64("MAX_WS_MESSAGE_BYTES", cfg.MaxWSMessageBytes); err != nil {
		return Config{}, err
	}
	if cfg.MaxRoomOperations, err = envInt("MAX_ROOM_OPERATIONS", cfg.MaxRoomOperations); err != nil {
		return Config{}, err
	}
	if cfg.MaxRecentOperationIDs, err = envInt("MAX_RECENT_OP_IDS", cfg.MaxRecentOperationIDs); err != nil {
		return Config{}, err
	}
	if cfg.MaxClientSendQueue, err = envInt("MAX_CLIENT_SEND_QUEUE", cfg.MaxClientSendQueue); err != nil {
		return Config{}, err
	}
	if cfg.MaxClientMessagesPerSecond, err = envInt("MAX_CLIENT_MESSAGES_PER_SECOND", cfg.MaxClientMessagesPerSecond); err != nil {
		return Config{}, err
	}

	for name, target := range map[string]*time.Duration{
		"ROOM_IDLE_TTL":         &cfg.RoomIdleTTL,
		"ROOM_MAX_TTL":          &cfg.RoomMaxTTL,
		"ROOM_CLEANUP_INTERVAL": &cfg.RoomCleanupInterval,
		"WS_PING_INTERVAL":      &cfg.WSPingInterval,
		"WS_PONG_TIMEOUT":       &cfg.WSPongTimeout,
		"WS_WRITE_TIMEOUT":      &cfg.WSWriteTimeout,
		"SHUTDOWN_TIMEOUT":      &cfg.ShutdownTimeout,
	} {
		if *target, err = envDuration(name, *target); err != nil {
			return Config{}, err
		}
	}

	if raw := strings.TrimSpace(os.Getenv("LOG_LEVEL")); raw != "" {
		if err := cfg.LogLevel.UnmarshalText([]byte(strings.ToLower(raw))); err != nil {
			return Config{}, fmt.Errorf("LOG_LEVEL: %w", err)
		}
	}

	origins := os.Getenv("ALLOWED_ORIGINS")
	if strings.TrimSpace(origins) == "" {
		origins = "http://localhost:3000,http://127.0.0.1:3000"
	}
	cfg.AllowedOrigins, err = parseOrigins(origins)
	if err != nil {
		return Config{}, err
	}

	if err := cfg.Validate(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

func (c Config) Validate() error {
	if c.Port < 1 || c.Port > 65535 {
		return fmt.Errorf("PORT must be between 1 and 65535")
	}
	if c.MaxRoomParticipants < 1 || c.MaxRoomParticipants > 10 {
		return fmt.Errorf("MAX_ROOM_PARTICIPANTS must be between 1 and 10")
	}
	if c.MaxActiveRooms < 1 {
		return fmt.Errorf("MAX_ACTIVE_ROOMS must be positive")
	}
	if c.RoomIdleTTL <= 0 || c.RoomMaxTTL <= 0 || c.RoomMaxTTL < c.RoomIdleTTL {
		return fmt.Errorf("ROOM_MAX_TTL must be greater than or equal to positive ROOM_IDLE_TTL")
	}
	if c.RoomCleanupInterval <= 0 || c.RoomCleanupInterval > c.RoomIdleTTL {
		return fmt.Errorf("ROOM_CLEANUP_INTERVAL must be positive and no greater than ROOM_IDLE_TTL")
	}
	if c.MaxHTTPBodyBytes < 1024 || c.MaxWSMessageBytes < 1024 {
		return fmt.Errorf("HTTP and WebSocket byte limits must be at least 1024")
	}
	if c.MaxRoomOperations < 1 || c.MaxRecentOperationIDs < c.MaxRoomOperations {
		return fmt.Errorf("MAX_RECENT_OP_IDS must be at least MAX_ROOM_OPERATIONS, and both must be positive")
	}
	if c.MaxClientSendQueue < 1 || c.MaxClientMessagesPerSecond < 1 {
		return fmt.Errorf("client queue and message-rate limits must be positive")
	}
	if c.WSPingInterval <= 0 || c.WSPongTimeout <= 0 || c.WSWriteTimeout <= 0 || c.ShutdownTimeout <= 0 {
		return fmt.Errorf("WebSocket and shutdown durations must be positive")
	}
	if len(c.AllowedOrigins) == 0 {
		return fmt.Errorf("ALLOWED_ORIGINS must contain at least one origin")
	}
	return nil
}

func parseOrigins(raw string) (map[string]struct{}, error) {
	origins := make(map[string]struct{})
	for _, part := range strings.Split(raw, ",") {
		origin := strings.TrimSpace(part)
		if origin == "" {
			continue
		}
		if origin == "*" {
			return nil, fmt.Errorf("ALLOWED_ORIGINS may not contain a wildcard")
		}
		parsed, err := url.Parse(origin)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || parsed.Path != "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
			return nil, fmt.Errorf("ALLOWED_ORIGINS contains invalid origin %q", origin)
		}
		normalized := strings.ToLower(parsed.Scheme + "://" + parsed.Host)
		origins[normalized] = struct{}{}
	}
	return origins, nil
}

func envInt(name string, fallback int) (int, error) {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.Atoi(raw)
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer: %w", name, err)
	}
	return value, nil
}

func envInt64(name string, fallback int64) (int64, error) {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback, nil
	}
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer: %w", name, err)
	}
	return value, nil
}

func envDuration(name string, fallback time.Duration) (time.Duration, error) {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return fallback, nil
	}
	value, err := time.ParseDuration(raw)
	if err != nil {
		return 0, fmt.Errorf("%s must be a Go duration: %w", name, err)
	}
	return value, nil
}
