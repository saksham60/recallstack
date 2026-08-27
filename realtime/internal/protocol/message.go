package protocol

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strings"
)

const Version = 1

type MessageType string

const (
	TypeRoomState MessageType = "room.state"
	TypeCommit    MessageType = "op.commit"
	TypeEphemeral MessageType = "op.ephemeral"
	TypePresence  MessageType = "presence"
	TypeAck       MessageType = "ack"
	TypeError     MessageType = "error"
	TypePing      MessageType = "ping"
	TypePong      MessageType = "pong"
)

type Envelope struct {
	Version         int                  `json:"v"`
	Type            MessageType          `json:"type"`
	OpID            string               `json:"opId,omitempty"`
	ActorID         string               `json:"actorId,omitempty"`
	Sequence        uint64               `json:"sequence,omitempty"`
	Duplicate       bool                 `json:"duplicate,omitempty"`
	Payload         json.RawMessage      `json:"payload,omitempty"`
	Snapshot        json.RawMessage      `json:"snapshot,omitempty"`
	Operations      []CommittedOperation `json:"operations,omitempty"`
	Presence        []PresenceState      `json:"presence,omitempty"`
	StateMode       string               `json:"stateMode,omitempty"`
	CurrentSequence uint64               `json:"currentSequence,omitempty"`
	HistoryStartsAt uint64               `json:"historyStartsAt,omitempty"`
	Error           *ErrorBody           `json:"error,omitempty"`
}

type CommittedOperation struct {
	Version  int             `json:"v"`
	Type     MessageType     `json:"type"`
	OpID     string          `json:"opId"`
	ActorID  string          `json:"actorId"`
	Sequence uint64          `json:"sequence"`
	Payload  json.RawMessage `json:"payload"`
}

type PresenceState struct {
	ActorID string          `json:"actorId"`
	Payload json.RawMessage `json:"payload"`
}

func DecodeClientMessage(data []byte, expectedActorID string) (Envelope, error) {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var message Envelope
	if err := decoder.Decode(&message); err != nil {
		return Envelope{}, &ClientMessageError{ErrorMalformedMessage, CloseMalformedMessage, "message must be a valid protocol envelope"}
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return Envelope{}, &ClientMessageError{ErrorMalformedMessage, CloseMalformedMessage, "message must contain one JSON object"}
	}
	if message.Version != Version {
		return Envelope{}, &ClientMessageError{ErrorUnsupportedVersion, CloseUnsupportedVersion, "unsupported protocol version"}
	}
	if !validIdentifier(message.ActorID) || message.ActorID != expectedActorID {
		return Envelope{}, &ClientMessageError{ErrorActorMismatch, CloseActorMismatch, "actorId does not match this connection"}
	}
	if len(message.Payload) > 0 && !json.Valid(message.Payload) {
		return Envelope{}, &ClientMessageError{ErrorMalformedMessage, CloseMalformedMessage, "payload must be valid JSON"}
	}
	if len(message.Snapshot) > 0 && !json.Valid(message.Snapshot) {
		return Envelope{}, &ClientMessageError{ErrorMalformedMessage, CloseMalformedMessage, "snapshot checkpoint must be valid JSON"}
	}

	switch message.Type {
	case TypeCommit:
		if !validIdentifier(message.OpID) || len(message.Payload) == 0 {
			return Envelope{}, &ClientMessageError{ErrorInvalidOperation, CloseMalformedMessage, "committed operations require opId and payload"}
		}
	case TypeEphemeral, TypePresence:
		if len(message.Payload) == 0 {
			return Envelope{}, &ClientMessageError{ErrorInvalidOperation, CloseMalformedMessage, "message payload is required"}
		}
	case TypePing, TypePong:
		// Application-level ping/pong is optional; WebSocket control-frame pings
		// provide transport liveness independently.
	default:
		return Envelope{}, &ClientMessageError{ErrorUnsupportedType, CloseMalformedMessage, "unsupported client message type"}
	}
	return message, nil
}

func ValidIdentifier(value string) bool { return validIdentifier(value) }

func Marshal(message Envelope) []byte {
	data, err := json.Marshal(message)
	if err != nil {
		panic(fmt.Sprintf("marshal trusted protocol message: %v", err))
	}
	return data
}

func ErrorMessage(code ErrorCode, message string) []byte {
	return Marshal(Envelope{Version: Version, Type: TypeError, Error: &ErrorBody{Code: code, Message: message}})
}

func validIdentifier(value string) bool {
	if value == "" || len(value) > 128 || strings.TrimSpace(value) != value {
		return false
	}
	for _, character := range value {
		if character < 0x21 || character == 0x7f {
			return false
		}
	}
	return true
}
