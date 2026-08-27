package config

import (
	"strings"
	"testing"
	"time"
)

func TestLoadDefaults(t *testing.T) {
	clearEnvironment(t)
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.Port != 8080 || cfg.MaxRoomParticipants != 10 || cfg.MaxActiveRooms != 1000 {
		t.Fatalf("unexpected defaults: port=%d participants=%d rooms=%d", cfg.Port, cfg.MaxRoomParticipants, cfg.MaxActiveRooms)
	}
	if _, ok := cfg.AllowedOrigins["http://localhost:3000"]; !ok {
		t.Fatal("localhost origin missing from development defaults")
	}
}

func TestLoadRejectsUnsafeOrInvalidConfiguration(t *testing.T) {
	tests := []struct {
		name  string
		key   string
		value string
		want  string
	}{
		{"wildcard origin", "ALLOWED_ORIGINS", "*", "wildcard"},
		{"too many participants", "MAX_ROOM_PARTICIPANTS", "11", "between 1 and 10"},
		{"invalid TTL", "ROOM_MAX_TTL", "1m", "greater than or equal"},
		{"invalid integer", "PORT", "abc", "must be an integer"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			clearEnvironment(t)
			if test.key == "ROOM_MAX_TTL" {
				t.Setenv("ROOM_IDLE_TTL", "2m")
			}
			t.Setenv(test.key, test.value)
			_, err := Load()
			if err == nil || !strings.Contains(err.Error(), test.want) {
				t.Fatalf("Load() error = %v, want containing %q", err, test.want)
			}
		})
	}
}

func TestLoadParsesOverrides(t *testing.T) {
	clearEnvironment(t)
	t.Setenv("PORT", "9090")
	t.Setenv("ALLOWED_ORIGINS", "https://recallstack.vercel.app, http://localhost:5173")
	t.Setenv("ROOM_IDLE_TTL", "45m")
	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.Port != 9090 || cfg.RoomIdleTTL != 45*time.Minute {
		t.Fatalf("overrides not applied: %+v", cfg)
	}
	if len(cfg.AllowedOrigins) != 2 {
		t.Fatalf("origins = %v", cfg.AllowedOrigins)
	}
}

func clearEnvironment(t *testing.T) {
	t.Helper()
	for _, key := range []string{
		"PORT", "LOG_LEVEL", "ALLOWED_ORIGINS", "MAX_ROOM_PARTICIPANTS", "MAX_ACTIVE_ROOMS",
		"ROOM_IDLE_TTL", "ROOM_MAX_TTL", "ROOM_CLEANUP_INTERVAL",
		"MAX_HTTP_BODY_BYTES", "MAX_WS_MESSAGE_BYTES", "MAX_ROOM_OPERATIONS",
		"MAX_RECENT_OP_IDS", "MAX_CLIENT_SEND_QUEUE", "MAX_CLIENT_MESSAGES_PER_SECOND",
		"WS_PING_INTERVAL", "WS_PONG_TIMEOUT", "WS_WRITE_TIMEOUT", "SHUTDOWN_TIMEOUT",
	} {
		t.Setenv(key, "")
	}
}
