package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/saksham60/recallstack/realtime/internal/protocol"
	"github.com/saksham60/recallstack/realtime/internal/room"
)

type createRoomRequest struct {
	Snapshot json.RawMessage `json:"snapshot"`
}

type createRoomResponse struct {
	RoomID          string `json:"roomId"`
	RoomToken       string `json:"roomToken"`
	ExpiresAt       string `json:"expiresAt"`
	MaxParticipants int    `json:"maxParticipants"`
	WebSocketPath   string `json:"websocketPath"`
}

func createRoom(manager *room.Manager, maxBodyBytes int64, maxParticipants int) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		var request createRoomRequest
		if err := decoder.Decode(&request); err != nil {
			var maxBytesError *http.MaxBytesError
			if errors.As(err, &maxBytesError) {
				writeAPIError(w, http.StatusRequestEntityTooLarge, protocol.ErrorInvalidOperation, "request body is too large")
				return
			}
			writeAPIError(w, http.StatusBadRequest, protocol.ErrorMalformedMessage, "request must be valid JSON")
			return
		}
		if err := ensureEOF(decoder); err != nil {
			writeAPIError(w, http.StatusBadRequest, protocol.ErrorMalformedMessage, "request must contain one JSON object")
			return
		}
		if len(request.Snapshot) == 0 || !json.Valid(request.Snapshot) {
			writeAPIError(w, http.StatusBadRequest, protocol.ErrorInvalidOperation, "snapshot must contain valid JSON")
			return
		}
		created, err := manager.Create(request.Snapshot)
		if err != nil {
			if errors.Is(err, room.ErrManagerFull) {
				writeAPIError(w, http.StatusServiceUnavailable, protocol.ErrorServerCapacity, "realtime room capacity has been reached")
				return
			}
			writeAPIError(w, http.StatusInternalServerError, protocol.ErrorInternal, "room could not be created")
			return
		}
		writeJSON(w, http.StatusCreated, createRoomResponse{RoomID: created.RoomID, RoomToken: created.Token, ExpiresAt: created.ExpiresAt.UTC().Format("2006-01-02T15:04:05.000Z07:00"), MaxParticipants: maxParticipants, WebSocketPath: "/v1/rooms/" + created.Token + "/ws"})
	}
}

func ensureEOF(decoder *json.Decoder) error {
	var extra any
	err := decoder.Decode(&extra)
	if errors.Is(err, io.EOF) {
		return nil
	}
	if err == nil {
		return errors.New("extra JSON value")
	}
	return err
}

func writeAPIError(w http.ResponseWriter, status int, code protocol.ErrorCode, message string) {
	writeJSON(w, status, protocol.Envelope{Version: protocol.Version, Type: protocol.TypeError, Error: &protocol.ErrorBody{Code: code, Message: message}})
}
