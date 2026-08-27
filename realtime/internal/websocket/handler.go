package websocket

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	coderws "github.com/coder/websocket"

	"github.com/saksham60/recallstack/realtime/internal/metrics"
	"github.com/saksham60/recallstack/realtime/internal/protocol"
	"github.com/saksham60/recallstack/realtime/internal/room"
)

type Handler struct {
	manager         *room.Manager
	registry        *metrics.Registry
	logger          *slog.Logger
	options         ClientOptions
	maxParticipants int
}

func NewHandler(manager *room.Manager, registry *metrics.Registry, logger *slog.Logger, options ClientOptions, maxParticipants int) *Handler {
	return &Handler{manager: manager, registry: registry, logger: logger, options: options, maxParticipants: maxParticipants}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	token := r.PathValue("roomToken")
	roomValue, ok := h.manager.Find(token)
	if !ok {
		writeHTTPError(w, http.StatusNotFound, protocol.ErrorRoomNotFound, "room not found")
		return
	}
	actorID := strings.TrimSpace(r.URL.Query().Get("actorId"))
	if !protocol.ValidIdentifier(actorID) {
		writeHTTPError(w, http.StatusBadRequest, protocol.ErrorInvalidOperation, "actorId query parameter is invalid")
		return
	}
	lastSequence, err := parseLastSequence(r.URL.Query().Get("lastSequence"))
	if err != nil {
		writeHTTPError(w, http.StatusBadRequest, protocol.ErrorInvalidOperation, "lastSequence must be an unsigned integer")
		return
	}

	checkContext, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	metadata, err := roomValue.Metadata(checkContext)
	cancel()
	if err != nil {
		writeHTTPError(w, http.StatusGone, protocol.ErrorRoomExpired, "room expired")
		return
	}
	if !metadata.ExpiresAt.After(time.Now()) {
		writeHTTPError(w, http.StatusGone, protocol.ErrorRoomExpired, "room expired")
		return
	}
	if metadata.ParticipantCount >= h.maxParticipants {
		writeHTTPError(w, http.StatusConflict, protocol.ErrorRoomFull, "room is full")
		return
	}

	// The outer origin middleware has already applied the configured exact-origin
	// allowlist, so the library's same-origin-only fallback must not repeat it.
	conn, err := coderws.Accept(w, r, &coderws.AcceptOptions{InsecureSkipVerify: true, CompressionMode: coderws.CompressionContextTakeover})
	if err != nil {
		h.logger.Warn("websocket upgrade failed", "room", roomValue.Fingerprint(), "error", err)
		return
	}
	client, err := NewClient(actorID, conn, h.options, h.registry)
	if err != nil {
		_ = conn.Close(coderws.StatusInternalError, "connection setup failed")
		return
	}
	if err := roomValue.Join(r.Context(), client, lastSequence); err != nil {
		switch {
		case errors.Is(err, room.ErrFull):
			client.Disconnect(protocol.CloseRoomFull, "room is full")
		case errors.Is(err, room.ErrExpired):
			client.Disconnect(protocol.CloseRoomExpired, "room expired")
		default:
			client.Disconnect(protocol.CloseInternal, "unable to join room")
		}
		_ = client.Run(r.Context(), func(context.Context, protocol.Envelope) error { return nil })
		return
	}
	defer roomValue.Leave(client.ID())

	err = client.Run(r.Context(), func(ctx context.Context, message protocol.Envelope) error {
		_, handleErr := roomValue.Handle(ctx, client.ID(), message)
		return handleErr
	})
	if err != nil {
		client.CloseWithError(err)
		h.logger.Info("websocket disconnected", "room", roomValue.Fingerprint(), "error", safeConnectionError(err))
	}
}

func parseLastSequence(raw string) (uint64, error) {
	if strings.TrimSpace(raw) == "" {
		return 0, nil
	}
	return strconv.ParseUint(raw, 10, 64)
}

func safeConnectionError(err error) string {
	var messageError *protocol.ClientMessageError
	if errors.As(err, &messageError) {
		return string(messageError.Code)
	}
	status := coderws.CloseStatus(err)
	if status != -1 {
		return status.String()
	}
	return "transport_error"
}

func writeHTTPError(w http.ResponseWriter, status int, code protocol.ErrorCode, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(protocol.ErrorMessage(code, message))
}
