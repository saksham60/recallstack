package httpapi

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/saksham60/recallstack/realtime/internal/config"
	"github.com/saksham60/recallstack/realtime/internal/metrics"
	"github.com/saksham60/recallstack/realtime/internal/room"
	ws "github.com/saksham60/recallstack/realtime/internal/websocket"
)

func NewRouter(cfg config.Config, manager *room.Manager, registry *metrics.Registry, logger *slog.Logger) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", health)
	mux.HandleFunc("GET /readyz", health)
	mux.HandleFunc("GET /metrics", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; version=0.0.4")
		if err := registry.WritePrometheus(w); err != nil {
			logger.Warn("metrics response failed", "error", err)
		}
	})
	mux.HandleFunc("POST /v1/rooms", createRoom(manager, cfg.MaxHTTPBodyBytes, cfg.MaxRoomParticipants))
	mux.Handle("GET /v1/rooms/{roomToken}/ws", ws.NewHandler(manager, registry, logger, ws.ClientOptions{SendQueueCapacity: cfg.MaxClientSendQueue, MaxMessageBytes: cfg.MaxWSMessageBytes, MaxMessagesPerSecond: cfg.MaxClientMessagesPerSecond, PingInterval: cfg.WSPingInterval, PongTimeout: cfg.WSPongTimeout, WriteTimeout: cfg.WSWriteTimeout}, cfg.MaxRoomParticipants))
	return originMiddleware(cfg.AllowedOrigins, mux)
}

func originMiddleware(allowed map[string]struct{}, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := strings.ToLower(strings.TrimSpace(r.Header.Get("Origin")))
		if origin != "" {
			if _, ok := allowed[origin]; !ok {
				http.Error(w, "origin not allowed", http.StatusForbidden)
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", r.Header.Get("Origin"))
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Add("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
