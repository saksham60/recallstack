package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	coderws "github.com/coder/websocket"

	"github.com/saksham60/recallstack/realtime/internal/config"
	"github.com/saksham60/recallstack/realtime/internal/metrics"
	"github.com/saksham60/recallstack/realtime/internal/protocol"
	"github.com/saksham60/recallstack/realtime/internal/room"
)

type integrationServer struct {
	server  *httptest.Server
	manager *room.Manager
	cfg     config.Config
}

func newIntegrationServer(t *testing.T, mutate func(*config.Config)) *integrationServer {
	t.Helper()
	cfg := config.Config{
		AllowedOrigins:             map[string]struct{}{"https://recallstack.example": {}},
		MaxActiveRooms:             100,
		MaxRoomParticipants:        10,
		RoomIdleTTL:                time.Hour,
		RoomMaxTTL:                 2 * time.Hour,
		RoomCleanupInterval:        time.Minute,
		MaxHTTPBodyBytes:           64 << 10,
		MaxWSMessageBytes:          64 << 10,
		MaxRoomOperations:          100,
		MaxRecentOperationIDs:      200,
		MaxClientSendQueue:         32,
		MaxClientMessagesPerSecond: 1000,
		WSPingInterval:             30 * time.Second,
		WSPongTimeout:              2 * time.Second,
		WSWriteTimeout:             2 * time.Second,
		ShutdownTimeout:            2 * time.Second,
	}
	if mutate != nil {
		mutate(&cfg)
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	registry := metrics.New()
	manager := room.NewManager(room.Options{MaxRooms: cfg.MaxActiveRooms, MaxParticipants: cfg.MaxRoomParticipants, MaxOperations: cfg.MaxRoomOperations, MaxRecentOpIDs: cfg.MaxRecentOperationIDs, IdleTTL: cfg.RoomIdleTTL, MaxTTL: cfg.RoomMaxTTL}, registry, logger)
	server := httptest.NewServer(NewRouter(cfg, manager, registry, logger))
	harness := &integrationServer{server: server, manager: manager, cfg: cfg}
	t.Cleanup(func() {
		server.CloseClientConnections()
		server.Close()
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = manager.Close(ctx)
	})
	return harness
}

func (s *integrationServer) createRoom(t *testing.T) createRoomResponse {
	t.Helper()
	request, err := http.NewRequest(http.MethodPost, s.server.URL+"/v1/rooms", bytes.NewBufferString(`{"snapshot":{"nodes":[],"edges":[]}}`))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", "https://recallstack.example")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusCreated {
		data, _ := io.ReadAll(response.Body)
		t.Fatalf("create room status = %d: %s", response.StatusCode, data)
	}
	var created createRoomResponse
	if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}
	return created
}

func (s *integrationServer) dial(t *testing.T, token, actor string) (*coderws.Conn, *http.Response, error) {
	t.Helper()
	websocketURL := "ws" + strings.TrimPrefix(s.server.URL, "http") + "/v1/rooms/" + token + "/ws?actorId=" + actor
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	return coderws.Dial(ctx, websocketURL, &coderws.DialOptions{HTTPHeader: http.Header{"Origin": []string{"https://recallstack.example"}}})
}

func readUntil(t *testing.T, connection *coderws.Conn, predicate func(protocol.Envelope) bool) protocol.Envelope {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	for {
		messageType, data, err := connection.Read(ctx)
		if err != nil {
			t.Fatalf("WebSocket read failed: %v", err)
		}
		if messageType != coderws.MessageText {
			continue
		}
		var message protocol.Envelope
		if err := json.Unmarshal(data, &message); err != nil {
			t.Fatalf("invalid server JSON: %v", err)
		}
		if predicate(message) {
			return message
		}
	}
}

func writeEnvelope(t *testing.T, connection *coderws.Conn, message protocol.Envelope) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := connection.Write(ctx, coderws.MessageText, protocol.Marshal(message)); err != nil {
		t.Fatalf("WebSocket write failed: %v", err)
	}
}

func TestHealthCreateRoomAndOriginPolicy(t *testing.T) {
	harness := newIntegrationServer(t, nil)
	response, err := http.Get(harness.server.URL + "/healthz")
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("health status = %d", response.StatusCode)
	}
	var health map[string]string
	_ = json.NewDecoder(response.Body).Decode(&health)
	if health["status"] != "ok" {
		t.Fatalf("health response = %v", health)
	}

	created := harness.createRoom(t)
	if created.RoomID == "" || len(created.RoomToken) < 43 || created.MaxParticipants != 10 || !strings.Contains(created.WebSocketPath, created.RoomToken) {
		t.Fatalf("invalid create response: %+v", created)
	}

	request, _ := http.NewRequest(http.MethodGet, harness.server.URL+"/metrics", nil)
	request.Header.Set("Origin", "https://attacker.example")
	blocked, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer blocked.Body.Close()
	if blocked.StatusCode != http.StatusForbidden {
		t.Fatalf("disallowed origin status = %d", blocked.StatusCode)
	}
}

func TestCreateRoomRejectsOversizedAndMalformedBodies(t *testing.T) {
	harness := newIntegrationServer(t, func(cfg *config.Config) { cfg.MaxHTTPBodyBytes = 1024 })
	tests := []struct {
		name       string
		body       string
		wantStatus int
	}{
		{"oversized", `{"snapshot":"` + strings.Repeat("x", 2048) + `"}`, http.StatusRequestEntityTooLarge},
		{"malformed", `{"snapshot":`, http.StatusBadRequest},
		{"unknown field", `{"snapshot":{},"extra":true}`, http.StatusBadRequest},
		{"trailing value", `{"snapshot":{}} {}`, http.StatusBadRequest},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request, _ := http.NewRequest(http.MethodPost, harness.server.URL+"/v1/rooms", strings.NewReader(test.body))
			request.Header.Set("Origin", "https://recallstack.example")
			response, err := http.DefaultClient.Do(request)
			if err != nil {
				t.Fatal(err)
			}
			defer response.Body.Close()
			if response.StatusCode != test.wantStatus {
				t.Fatalf("status = %d, want %d", response.StatusCode, test.wantStatus)
			}
		})
	}
}

func TestTwoClientCommittedOperationFlow(t *testing.T) {
	harness := newIntegrationServer(t, nil)
	created := harness.createRoom(t)
	a, response, err := harness.dial(t, created.RoomToken, "alice")
	if err != nil {
		t.Fatalf("dial A failed: response=%v error=%v", response, err)
	}
	defer a.CloseNow()
	b, response, err := harness.dial(t, created.RoomToken, "bob")
	if err != nil {
		t.Fatalf("dial B failed: response=%v error=%v", response, err)
	}
	defer b.CloseNow()

	stateA := readUntil(t, a, func(message protocol.Envelope) bool { return message.Type == protocol.TypeRoomState })
	stateB := readUntil(t, b, func(message protocol.Envelope) bool { return message.Type == protocol.TypeRoomState })
	if stateA.CurrentSequence != 0 || stateB.CurrentSequence != 0 || len(stateA.Snapshot) == 0 {
		t.Fatalf("unexpected initial states: A=%+v B=%+v", stateA, stateB)
	}

	writeEnvelope(t, a, protocol.Envelope{Version: 1, Type: protocol.TypeCommit, OpID: "alice-1", ActorID: "alice", Payload: json.RawMessage(`{"kind":"node.move"}`)})
	commitAtB := readUntil(t, b, func(message protocol.Envelope) bool {
		return message.Type == protocol.TypeCommit && message.OpID == "alice-1"
	})
	commitAtA := readUntil(t, a, func(message protocol.Envelope) bool {
		return message.Type == protocol.TypeCommit && message.OpID == "alice-1"
	})
	ackAtA := readUntil(t, a, func(message protocol.Envelope) bool {
		return message.Type == protocol.TypeAck && message.OpID == "alice-1"
	})
	if commitAtA.Sequence != 1 || commitAtB.Sequence != 1 || ackAtA.Sequence != 1 {
		t.Fatalf("first sequence mismatch: A=%d B=%d ack=%d", commitAtA.Sequence, commitAtB.Sequence, ackAtA.Sequence)
	}

	writeEnvelope(t, b, protocol.Envelope{Version: 1, Type: protocol.TypeCommit, OpID: "bob-1", ActorID: "bob", Payload: json.RawMessage(`{"kind":"edge.add"}`)})
	commitAtA = readUntil(t, a, func(message protocol.Envelope) bool {
		return message.Type == protocol.TypeCommit && message.OpID == "bob-1"
	})
	if commitAtA.Sequence != 2 {
		t.Fatalf("second sequence = %d, want 2", commitAtA.Sequence)
	}
}

func TestWebSocketParticipantLimit(t *testing.T) {
	harness := newIntegrationServer(t, nil)
	created := harness.createRoom(t)
	connections := make([]*coderws.Conn, 0, 10)
	for index := 0; index < 10; index++ {
		connection, response, err := harness.dial(t, created.RoomToken, fmt.Sprintf("actor-%d", index))
		if err != nil {
			t.Fatalf("dial %d failed: response=%v error=%v", index, response, err)
		}
		connections = append(connections, connection)
		readUntil(t, connection, func(message protocol.Envelope) bool { return message.Type == protocol.TypeRoomState })
	}
	defer func() {
		for _, connection := range connections {
			connection.CloseNow()
		}
	}()

	connection, response, err := harness.dial(t, created.RoomToken, "actor-11")
	if connection != nil {
		connection.CloseNow()
	}
	if err == nil || response == nil || response.StatusCode != http.StatusConflict {
		t.Fatalf("11th dial: response=%v error=%v, want HTTP 409", response, err)
	}
}

func TestInvalidWebSocketMessagesCloseSafely(t *testing.T) {
	tests := []struct {
		name       string
		message    []byte
		maxBytes   int64
		wantStatus coderws.StatusCode
	}{
		{"malformed JSON", []byte(`{`), 64 << 10, coderws.StatusCode(protocol.CloseMalformedMessage)},
		{"unsupported version", []byte(`{"v":2,"type":"ping","actorId":"alice"}`), 64 << 10, coderws.StatusCode(protocol.CloseUnsupportedVersion)},
		{"oversized", []byte(`{"v":1,"type":"op.ephemeral","actorId":"alice","payload":"` + strings.Repeat("x", 2000) + `"}`), 1024, coderws.StatusMessageTooBig},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			harness := newIntegrationServer(t, func(cfg *config.Config) { cfg.MaxWSMessageBytes = test.maxBytes })
			created := harness.createRoom(t)
			connection, response, err := harness.dial(t, created.RoomToken, "alice")
			if err != nil {
				t.Fatalf("dial failed: response=%v error=%v", response, err)
			}
			defer connection.CloseNow()
			readUntil(t, connection, func(message protocol.Envelope) bool { return message.Type == protocol.TypeRoomState })
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			if err := connection.Write(ctx, coderws.MessageText, test.message); err != nil {
				t.Fatalf("write invalid message: %v", err)
			}
			_, _, err = connection.Read(ctx)
			if status := coderws.CloseStatus(err); status != test.wantStatus {
				t.Fatalf("close status = %v (error %v), want %v", status, err, test.wantStatus)
			}
		})
	}
}
