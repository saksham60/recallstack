package room

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"sort"
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/saksham60/recallstack/realtime/internal/metrics"
	"github.com/saksham60/recallstack/realtime/internal/protocol"
)

type fakeParticipant struct {
	id           string
	actorID      string
	messages     chan []byte
	rejectWrites atomic.Bool
	disconnected chan int
}

func newFakeParticipant(id string, capacity int) *fakeParticipant {
	return &fakeParticipant{id: id, actorID: "actor-" + id, messages: make(chan []byte, capacity), disconnected: make(chan int, 1)}
}

func (p *fakeParticipant) ID() string      { return p.id }
func (p *fakeParticipant) ActorID() string { return p.actorID }
func (p *fakeParticipant) Send(data []byte) bool {
	if p.rejectWrites.Load() {
		return false
	}
	select {
	case p.messages <- append([]byte(nil), data...):
		return true
	default:
		return false
	}
}
func (p *fakeParticipant) Disconnect(code int, _ string) {
	select {
	case p.disconnected <- code:
	default:
	}
}

func testOptions() Options {
	return Options{MaxRooms: 100, MaxParticipants: 10, MaxOperations: 32, MaxRecentOpIDs: 64, IdleTTL: time.Hour, MaxTTL: 2 * time.Hour}
}

func testRoom(t *testing.T, options Options) (*Room, *metrics.Registry) {
	t.Helper()
	registry := metrics.New()
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	r := New("room-id", "fingerprint", json.RawMessage(`{"nodes":[]}`), options, registry, logger, time.Now())
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		defer cancel()
		_ = r.Stop(ctx, "test complete")
	})
	return r, registry
}

func joinAndReadState(t *testing.T, r *Room, p *fakeParticipant, lastSequence uint64) protocol.Envelope {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := r.Join(ctx, p, lastSequence); err != nil {
		t.Fatalf("Join() error = %v", err)
	}
	return readEnvelope(t, p)
}

func readEnvelope(t *testing.T, p *fakeParticipant) protocol.Envelope {
	t.Helper()
	select {
	case data := <-p.messages:
		var message protocol.Envelope
		if err := json.Unmarshal(data, &message); err != nil {
			t.Fatalf("invalid server message: %v", err)
		}
		return message
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for message")
		return protocol.Envelope{}
	}
}

func commit(actor, opID string) protocol.Envelope {
	return protocol.Envelope{Version: protocol.Version, Type: protocol.TypeCommit, ActorID: actor, OpID: opID, Payload: json.RawMessage(`{"kind":"opaque"}`)}
}

func TestParticipantLimitAndReplacement(t *testing.T) {
	r, _ := testRoom(t, testOptions())
	participants := make([]*fakeParticipant, 10)
	for index := range participants {
		participants[index] = newFakeParticipant(string(rune('a'+index)), 32)
		joinAndReadState(t, r, participants[index], 0)
	}
	extra := newFakeParticipant("extra", 4)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := r.Join(ctx, extra, 0); !errors.Is(err, ErrFull) {
		t.Fatalf("11th Join() error = %v, want ErrFull", err)
	}
	r.Leave(participants[0].ID())
	deadline := time.Now().Add(time.Second)
	for {
		metadata, err := r.Metadata(ctx)
		if err == nil && metadata.ParticipantCount == 9 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("leave was not processed")
		}
	}
	joinAndReadState(t, r, extra, 0)
}

func TestConcurrentCommittedOperationsAreOrderedAndUnique(t *testing.T) {
	options := testOptions()
	options.MaxOperations = 128
	r, _ := testRoom(t, options)
	sender := newFakeParticipant("sender", 512)
	joinAndReadState(t, r, sender, 0)

	const count = 100
	sequences := make(chan uint64, count)
	var wait sync.WaitGroup
	for index := 0; index < count; index++ {
		wait.Add(1)
		go func(index int) {
			defer wait.Done()
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			result, err := r.Handle(ctx, sender.ID(), commit(sender.ActorID(), "op-"+strconv.Itoa(index)))
			if err != nil {
				t.Errorf("Handle() error = %v", err)
				return
			}
			sequences <- result.Sequence
		}(index)
	}
	wait.Wait()
	close(sequences)

	values := make([]int, 0, count)
	for sequence := range sequences {
		values = append(values, int(sequence))
	}
	sort.Ints(values)
	for index, sequence := range values {
		if sequence != index+1 {
			t.Fatalf("sequences[%d] = %d, want %d", index, sequence, index+1)
		}
	}
	state, err := r.State(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if state.CurrentSequence != count || len(state.Operations) != count {
		t.Fatalf("unexpected bounded state: sequence=%d operations=%d", state.CurrentSequence, len(state.Operations))
	}
	for index := 1; index < len(state.Operations); index++ {
		if state.Operations[index].Sequence != state.Operations[index-1].Sequence+1 {
			t.Fatal("retained operations are not in strict sequence order")
		}
	}
}

func TestDeduplication(t *testing.T) {
	r, _ := testRoom(t, testOptions())
	p := newFakeParticipant("sender", 16)
	joinAndReadState(t, r, p, 0)
	first, err := r.Handle(context.Background(), p.ID(), commit(p.ActorID(), "same-op"))
	if err != nil {
		t.Fatal(err)
	}
	second, err := r.Handle(context.Background(), p.ID(), commit(p.ActorID(), "same-op"))
	if err != nil {
		t.Fatal(err)
	}
	if first.Sequence != 1 || second.Sequence != 1 || !second.Duplicate {
		t.Fatalf("dedupe results = %+v, %+v", first, second)
	}
	state, _ := r.State(context.Background())
	if len(state.Operations) != 1 || state.CurrentSequence != 1 {
		t.Fatalf("duplicate entered history: %+v", state)
	}
}

func TestHistoryLimitRequiresOpaqueSnapshotCheckpoint(t *testing.T) {
	options := testOptions()
	options.MaxOperations = 1
	r, _ := testRoom(t, options)
	p := newFakeParticipant("sender", 16)
	joinAndReadState(t, r, p, 0)
	if result, err := r.Handle(context.Background(), p.ID(), commit(p.ActorID(), "op-1")); err != nil || result.Sequence != 1 {
		t.Fatalf("first commit = %+v, %v", result, err)
	}
	if result, err := r.Handle(context.Background(), p.ID(), commit(p.ActorID(), "op-2")); err != nil || result.Sequence != 0 {
		t.Fatalf("commit without checkpoint = %+v, %v", result, err)
	}
	checkpointed := commit(p.ActorID(), "op-2")
	checkpointed.Snapshot = json.RawMessage(`{"current":"document"}`)
	if result, err := r.Handle(context.Background(), p.ID(), checkpointed); err != nil || result.Sequence != 2 {
		t.Fatalf("checkpointed commit = %+v, %v", result, err)
	}
	state, _ := r.State(context.Background())
	if state.CurrentSequence != 2 || len(state.Operations) != 0 || string(state.Snapshot) != `{"current":"document"}` {
		t.Fatalf("checkpoint did not compact state: %+v", state)
	}
}

func TestEphemeralBroadcastIsNotRetained(t *testing.T) {
	r, _ := testRoom(t, testOptions())
	a := newFakeParticipant("a", 16)
	b := newFakeParticipant("b", 16)
	joinAndReadState(t, r, a, 0)
	joinAndReadState(t, r, b, 0)
	_ = readEnvelope(t, a) // B joined.

	message := protocol.Envelope{Version: 1, Type: protocol.TypeEphemeral, ActorID: a.ActorID(), Payload: json.RawMessage(`{"kind":"cursor"}`)}
	if _, err := r.Handle(context.Background(), a.ID(), message); err != nil {
		t.Fatal(err)
	}
	received := readEnvelope(t, b)
	if received.Type != protocol.TypeEphemeral || received.Sequence != 0 {
		t.Fatalf("unexpected ephemeral broadcast: %+v", received)
	}
	state, _ := r.State(context.Background())
	if len(state.Operations) != 0 || state.CurrentSequence != 0 {
		t.Fatalf("ephemeral message entered history: %+v", state)
	}
}

func TestPresenceIsBroadcastCachedAndRemoved(t *testing.T) {
	r, _ := testRoom(t, testOptions())
	a := newFakeParticipant("a", 16)
	b := newFakeParticipant("b", 16)
	joinAndReadState(t, r, a, 0)
	joinAndReadState(t, r, b, 0)
	_ = readEnvelope(t, a)
	presence := protocol.Envelope{Version: 1, Type: protocol.TypePresence, ActorID: a.ActorID(), Payload: json.RawMessage(`{"cursor":{"x":10,"y":20}}`)}
	if _, err := r.Handle(context.Background(), a.ID(), presence); err != nil {
		t.Fatal(err)
	}
	if received := readEnvelope(t, b); received.Type != protocol.TypePresence || received.ActorID != a.ActorID() {
		t.Fatalf("unexpected presence broadcast: %+v", received)
	}
	c := newFakeParticipant("c", 16)
	joined := joinAndReadState(t, r, c, 0)
	if len(joined.Presence) != 1 || joined.Presence[0].ActorID != a.ActorID() {
		t.Fatalf("cached presence missing from join state: %+v", joined.Presence)
	}
	r.Leave(a.ID())
	deadline := time.Now().Add(time.Second)
	for {
		metadata, _ := r.Metadata(context.Background())
		if metadata.ParticipantCount == 2 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("leave was not processed")
		}
	}
	d := newFakeParticipant("d", 16)
	afterLeave := joinAndReadState(t, r, d, 0)
	if len(afterLeave.Presence) != 0 {
		t.Fatalf("departed presence was retained: %+v", afterLeave.Presence)
	}
}

func TestLateJoinReconnectAndPrunedFallback(t *testing.T) {
	options := testOptions()
	options.MaxOperations = 2
	r, _ := testRoom(t, options)
	sender := newFakeParticipant("sender", 32)
	joinAndReadState(t, r, sender, 0)
	for index := 1; index <= 4; index++ {
		message := commit(sender.ActorID(), "op-"+strconv.Itoa(index))
		if index == 2 {
			message.Snapshot = json.RawMessage(`{"checkpoint":2}`)
		}
		if _, err := r.Handle(context.Background(), sender.ID(), message); err != nil {
			t.Fatal(err)
		}
	}

	late := newFakeParticipant("late", 8)
	full := joinAndReadState(t, r, late, 0)
	if full.StateMode != "full" || string(full.Snapshot) != `{"checkpoint":2}` || len(full.Operations) != 2 || full.CurrentSequence != 4 {
		t.Fatalf("unexpected late join state: %+v", full)
	}
	r.Leave(late.ID())

	reconnecting := newFakeParticipant("reconnect", 8)
	replay := joinAndReadState(t, r, reconnecting, 2)
	if replay.StateMode != "replay" || len(replay.Snapshot) != 0 || len(replay.Operations) != 2 || replay.Operations[0].Sequence != 3 {
		t.Fatalf("unexpected replay: %+v", replay)
	}
	r.Leave(reconnecting.ID())

	pruned := newFakeParticipant("pruned", 8)
	fallback := joinAndReadState(t, r, pruned, 1)
	if fallback.StateMode != "full" || len(fallback.Snapshot) == 0 {
		t.Fatalf("expected full fallback, got %+v", fallback)
	}
}

func TestSlowClientCannotBlockRoom(t *testing.T) {
	r, registry := testRoom(t, testOptions())
	sender := newFakeParticipant("sender", 16)
	slow := newFakeParticipant("slow", 1)
	joinAndReadState(t, r, sender, 0)
	joinAndReadState(t, r, slow, 0)
	_ = readEnvelope(t, sender)
	slow.rejectWrites.Store(true)

	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if _, err := r.Handle(ctx, sender.ID(), commit(sender.ActorID(), "op-1")); err != nil {
		t.Fatalf("room was blocked by slow client: %v", err)
	}
	metadata, err := r.Metadata(ctx)
	if err != nil || metadata.ParticipantCount != 1 {
		t.Fatalf("slow client was not removed: metadata=%+v err=%v", metadata, err)
	}
	if registry.Snapshot().DroppedSlowClients != 1 {
		t.Fatalf("dropped_slow_clients = %d", registry.Snapshot().DroppedSlowClients)
	}
}

func TestManagerLifecycleTokensAndExpiry(t *testing.T) {
	registry := metrics.New()
	manager := NewManager(testOptions(), registry, slog.New(slog.NewTextHandler(io.Discard, nil)))
	t.Cleanup(func() { _ = manager.Close(context.Background()) })
	tokens := make(map[string]struct{})
	var first CreatedRoom
	for index := 0; index < 20; index++ {
		created, err := manager.Create(json.RawMessage(`{"document":true}`))
		if err != nil {
			t.Fatal(err)
		}
		if len(created.Token) < 43 {
			t.Fatalf("token has insufficient encoded length: %q", created.Token)
		}
		if _, duplicate := tokens[created.Token]; duplicate {
			t.Fatal("duplicate secure room token")
		}
		tokens[created.Token] = struct{}{}
		if index == 0 {
			first = created
		}
	}
	if found, ok := manager.Find(first.Token); !ok || found != first.Room {
		t.Fatal("created room could not be found")
	}
	if manager.Remove(context.Background(), first.Token, "test removal") == false {
		t.Fatal("Remove() returned false")
	}
	if _, ok := manager.Find(first.Token); ok {
		t.Fatal("removed room still exists")
	}

	expiring, err := manager.Create(json.RawMessage(`{}`))
	if err != nil {
		t.Fatal(err)
	}
	removed := manager.CleanupNow(context.Background(), time.Now().Add(90*time.Minute))
	if removed != 20 {
		t.Fatalf("CleanupNow() removed %d rooms, want 20", removed)
	}
	if _, ok := manager.Find(expiring.Token); ok {
		t.Fatal("expired room still exists")
	}
	if manager.Count() != 0 {
		t.Fatalf("manager count = %d", manager.Count())
	}
	stats := registry.Snapshot()
	if stats.ActiveRooms != 0 || stats.RoomsExpired != 20 {
		t.Fatalf("unexpected metrics after cleanup: %+v", stats)
	}
}

func TestManagerMaximumRoomCount(t *testing.T) {
	options := testOptions()
	options.MaxRooms = 1
	manager := NewManager(options, metrics.New(), slog.New(slog.NewTextHandler(io.Discard, nil)))
	t.Cleanup(func() { _ = manager.Close(context.Background()) })
	if _, err := manager.Create(json.RawMessage(`{}`)); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.Create(json.RawMessage(`{}`)); !errors.Is(err, ErrManagerFull) {
		t.Fatalf("second Create() error = %v, want ErrManagerFull", err)
	}
	if manager.Count() != 1 {
		t.Fatalf("manager count = %d, want 1", manager.Count())
	}
}

func TestHardTTLRejectsJoin(t *testing.T) {
	options := testOptions()
	r := New("old", "old-room", json.RawMessage(`{}`), options, metrics.New(), slog.New(slog.NewTextHandler(io.Discard, nil)), time.Now().Add(-options.MaxTTL))
	p := newFakeParticipant("late", 1)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := r.Join(ctx, p, 0); !errors.Is(err, ErrExpired) {
		t.Fatalf("Join() error = %v, want ErrExpired", err)
	}
	_ = r.Stop(ctx, "test complete")
}
