package room

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"sort"
	"time"

	"github.com/saksham60/recallstack/realtime/internal/metrics"
	"github.com/saksham60/recallstack/realtime/internal/protocol"
)

var (
	ErrClosed  = errors.New("room closed")
	ErrExpired = errors.New("room expired")
	ErrFull    = errors.New("room full")
)

type Participant interface {
	ID() string
	ActorID() string
	Send([]byte) bool
	Disconnect(closeCode int, reason string)
}

type Options struct {
	MaxRooms        int
	MaxParticipants int
	MaxOperations   int
	MaxRecentOpIDs  int
	IdleTTL         time.Duration
	MaxTTL          time.Duration
}

type Metadata struct {
	ID               string
	Fingerprint      string
	CreatedAt        time.Time
	LastActivityAt   time.Time
	ExpiresAt        time.Time
	ParticipantCount int
	CurrentSequence  uint64
	Closed           bool
}

type Room struct {
	id          string
	fingerprint string
	commands    chan any
	done        chan struct{}
}

type roomState struct {
	snapshot         json.RawMessage
	snapshotSequence uint64
	clients          map[string]Participant
	presence         map[string]protocol.PresenceState
	operations       []protocol.CommittedOperation
	recentOpIDs      map[string]uint64
	recentOpOrder    []string
	nextSequence     uint64
	createdAt        time.Time
	lastActivityAt   time.Time
	closed           bool
}

type joinCommand struct {
	participant  Participant
	lastSequence uint64
	response     chan error
}
type leaveCommand struct{ participantID string }
type messageCommand struct {
	participantID string
	message       protocol.Envelope
	response      chan messageResponse
}
type messageResponse struct {
	result HandleResult
	err    error
}
type metadataCommand struct{ response chan Metadata }
type stateCommand struct{ response chan State }
type expireCommand struct {
	now      time.Time
	force    bool
	expired  bool
	reason   string
	response chan bool
}

func New(id, fingerprint string, snapshot json.RawMessage, options Options, registry *metrics.Registry, logger *slog.Logger, now time.Time) *Room {
	r := &Room{
		id: id, fingerprint: fingerprint,
		commands: make(chan any, 256), done: make(chan struct{}),
	}
	state := roomState{
		snapshot: append(json.RawMessage(nil), snapshot...),
		clients:  make(map[string]Participant), presence: make(map[string]protocol.PresenceState),
		operations:  make([]protocol.CommittedOperation, 0, options.MaxOperations),
		recentOpIDs: make(map[string]uint64), recentOpOrder: make([]string, 0, options.MaxRecentOpIDs),
		nextSequence: 1, createdAt: now, lastActivityAt: now,
	}
	go r.run(state, options, registry, logger)
	return r
}

func (r *Room) ID() string            { return r.id }
func (r *Room) Fingerprint() string   { return r.fingerprint }
func (r *Room) Done() <-chan struct{} { return r.done }

func (r *Room) Join(ctx context.Context, participant Participant, lastSequence uint64) error {
	response := make(chan error, 1)
	if err := r.submit(ctx, joinCommand{participant, lastSequence, response}); err != nil {
		return err
	}
	select {
	case err := <-response:
		return err
	case <-ctx.Done():
		return ctx.Err()
	case <-r.done:
		return ErrClosed
	}
}

func (r *Room) Leave(participantID string) {
	select {
	case r.commands <- leaveCommand{participantID}:
	case <-r.done:
	}
}

func (r *Room) Handle(ctx context.Context, participantID string, message protocol.Envelope) (HandleResult, error) {
	response := make(chan messageResponse, 1)
	if err := r.submit(ctx, messageCommand{participantID, message, response}); err != nil {
		return HandleResult{}, err
	}
	select {
	case result := <-response:
		return result.result, result.err
	case <-ctx.Done():
		return HandleResult{}, ctx.Err()
	case <-r.done:
		return HandleResult{}, ErrClosed
	}
}

func (r *Room) Metadata(ctx context.Context) (Metadata, error) {
	response := make(chan Metadata, 1)
	if err := r.submit(ctx, metadataCommand{response}); err != nil {
		return Metadata{}, err
	}
	select {
	case metadata := <-response:
		return metadata, nil
	case <-ctx.Done():
		return Metadata{}, ctx.Err()
	case <-r.done:
		return Metadata{}, ErrClosed
	}
}

func (r *Room) State(ctx context.Context) (State, error) {
	response := make(chan State, 1)
	if err := r.submit(ctx, stateCommand{response}); err != nil {
		return State{}, err
	}
	select {
	case state := <-response:
		return state, nil
	case <-ctx.Done():
		return State{}, ctx.Err()
	case <-r.done:
		return State{}, ErrClosed
	}
}

func (r *Room) ExpireIfNeeded(ctx context.Context, now time.Time) (bool, error) {
	return r.expire(ctx, expireCommand{now: now, expired: true, reason: "room expired", response: make(chan bool, 1)})
}

func (r *Room) Stop(ctx context.Context, reason string) error {
	_, err := r.expire(ctx, expireCommand{now: time.Now(), force: true, reason: reason, response: make(chan bool, 1)})
	return err
}

func (r *Room) expire(ctx context.Context, command expireCommand) (bool, error) {
	if err := r.submit(ctx, command); err != nil {
		if errors.Is(err, ErrClosed) {
			return false, nil
		}
		return false, err
	}
	select {
	case expired := <-command.response:
		return expired, nil
	case <-ctx.Done():
		return false, ctx.Err()
	case <-r.done:
		return true, nil
	}
}

func (r *Room) submit(ctx context.Context, command any) error {
	select {
	case r.commands <- command:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	case <-r.done:
		return ErrClosed
	}
}

func (r *Room) run(state roomState, options Options, registry *metrics.Registry, logger *slog.Logger) {
	defer close(r.done)
	for command := range r.commands {
		switch command := command.(type) {
		case joinCommand:
			now := time.Now()
			if state.closed {
				command.response <- ErrClosed
				continue
			}
			if !expiredAt(state, options).After(now) {
				command.response <- ErrExpired
				continue
			}
			if len(state.clients) >= options.MaxParticipants {
				command.response <- ErrFull
				continue
			}
			if _, exists := state.clients[command.participant.ID()]; exists {
				command.response <- errors.New("participant already joined")
				continue
			}
			message := initialStateMessage(state, command.lastSequence)
			if !command.participant.Send(message) {
				command.response <- errors.New("participant output queue unavailable")
				continue
			}
			state.clients[command.participant.ID()] = command.participant
			state.lastActivityAt = now
			registry.ConnectionJoined()
			if command.lastSequence > 0 {
				registry.Reconnect()
			}
			command.response <- nil
			broadcastPresenceLifecycle(&state, command.participant, "joined", registry)
			logger.Info("participant joined", "room", r.fingerprint, "participants", len(state.clients))

		case leaveCommand:
			participant, exists := state.clients[command.participantID]
			if !exists {
				continue
			}
			delete(state.clients, command.participantID)
			delete(state.presence, command.participantID)
			state.lastActivityAt = time.Now()
			registry.ConnectionLeft()
			broadcastPresenceLifecycle(&state, participant, "left", registry)
			logger.Info("participant left", "room", r.fingerprint, "participants", len(state.clients))

		case messageCommand:
			participant, exists := state.clients[command.participantID]
			if !exists {
				command.response <- messageResponse{err: ErrClosed}
				continue
			}
			result, err := handleMessage(&state, participant, command.message, options, registry)
			command.response <- messageResponse{result: result, err: err}
			if command.message.Type == protocol.TypeCommit && result.Sequence > 0 {
				logger.Debug("committed operation", "room", r.fingerprint, "sequence", result.Sequence, "duplicate", result.Duplicate)
			}
			if command.message.Type != protocol.TypePing && command.message.Type != protocol.TypePong {
				state.lastActivityAt = time.Now()
			}

		case metadataCommand:
			command.response <- metadata(r.id, r.fingerprint, state, options)

		case stateCommand:
			command.response <- copyState(state)

		case expireCommand:
			shouldExpire := command.force || !expiredAt(state, options).After(command.now)
			if !shouldExpire {
				command.response <- false
				continue
			}
			state.closed = true
			closeCode := protocol.CloseInternal
			if command.expired {
				closeCode = protocol.CloseRoomExpired
			}
			for _, participant := range state.clients {
				participant.Disconnect(closeCode, command.reason)
				registry.ConnectionLeft()
			}
			state.clients = nil
			state.presence = nil
			command.response <- true
			return
		}
	}
}

func handleMessage(state *roomState, participant Participant, message protocol.Envelope, options Options, registry *metrics.Registry) (HandleResult, error) {
	switch message.Type {
	case protocol.TypeCommit:
		if sequence, exists := state.recentOpIDs[message.OpID]; exists {
			participant.Send(protocol.Marshal(protocol.Envelope{Version: protocol.Version, Type: protocol.TypeAck, OpID: message.OpID, ActorID: message.ActorID, Sequence: sequence, Duplicate: true}))
			return HandleResult{Sequence: sequence, Duplicate: true}, nil
		}
		if len(state.operations) >= options.MaxOperations && len(message.Snapshot) == 0 {
			participant.Send(protocol.ErrorMessage(protocol.ErrorCheckpointRequired, "operation history is full; resend the operation with a current snapshot checkpoint"))
			return HandleResult{}, nil
		}
		sequence := state.nextSequence
		state.nextSequence++
		operation := protocol.CommittedOperation{Version: protocol.Version, Type: protocol.TypeCommit, OpID: message.OpID, ActorID: message.ActorID, Sequence: sequence, Payload: append(json.RawMessage(nil), message.Payload...)}
		state.operations = append(state.operations, operation)
		if len(message.Snapshot) > 0 {
			state.snapshot = append(json.RawMessage(nil), message.Snapshot...)
			state.snapshotSequence = sequence
			state.operations = state.operations[:0]
		}
		state.recentOpIDs[message.OpID] = sequence
		state.recentOpOrder = append(state.recentOpOrder, message.OpID)
		if len(state.recentOpOrder) > options.MaxRecentOpIDs {
			oldest := state.recentOpOrder[0]
			state.recentOpOrder = state.recentOpOrder[1:]
			delete(state.recentOpIDs, oldest)
		}
		broadcast(state, protocol.Marshal(protocol.Envelope{Version: protocol.Version, Type: protocol.TypeCommit, OpID: operation.OpID, ActorID: operation.ActorID, Sequence: sequence, Payload: operation.Payload}), "", registry)
		participant.Send(protocol.Marshal(protocol.Envelope{Version: protocol.Version, Type: protocol.TypeAck, OpID: message.OpID, ActorID: message.ActorID, Sequence: sequence}))
		registry.CommittedOperation()
		return HandleResult{Sequence: sequence}, nil

	case protocol.TypeEphemeral:
		broadcast(state, protocol.Marshal(protocol.Envelope{Version: protocol.Version, Type: protocol.TypeEphemeral, OpID: message.OpID, ActorID: message.ActorID, Payload: message.Payload}), participant.ID(), registry)
		registry.EphemeralOperation()

	case protocol.TypePresence:
		state.presence[participant.ID()] = protocol.PresenceState{ActorID: message.ActorID, Payload: append(json.RawMessage(nil), message.Payload...)}
		broadcast(state, protocol.Marshal(protocol.Envelope{Version: protocol.Version, Type: protocol.TypePresence, ActorID: message.ActorID, Payload: message.Payload}), participant.ID(), registry)

	case protocol.TypePing:
		participant.Send(protocol.Marshal(protocol.Envelope{Version: protocol.Version, Type: protocol.TypePong, ActorID: message.ActorID, Payload: message.Payload}))
	case protocol.TypePong:
	}
	return HandleResult{}, nil
}

func initialStateMessage(state roomState, lastSequence uint64) []byte {
	current := state.nextSequence - 1
	historyStart := state.snapshotSequence + 1
	if len(state.operations) > 0 {
		historyStart = state.operations[0].Sequence
	}
	mode := "full"
	operations := append([]protocol.CommittedOperation(nil), state.operations...)
	var snapshot json.RawMessage = append(json.RawMessage(nil), state.snapshot...)
	if lastSequence > 0 && lastSequence >= state.snapshotSequence && lastSequence <= current && lastSequence+1 >= historyStart {
		mode = "replay"
		snapshot = nil
		operations = operations[:0]
		for _, operation := range state.operations {
			if operation.Sequence > lastSequence {
				operations = append(operations, operation)
			}
		}
	} else if lastSequence == current && lastSequence > 0 {
		mode = "replay"
		snapshot = nil
		operations = nil
	}
	presence := make([]protocol.PresenceState, 0, len(state.presence))
	for _, item := range state.presence {
		presence = append(presence, item)
	}
	sort.Slice(presence, func(i, j int) bool { return presence[i].ActorID < presence[j].ActorID })
	return protocol.Marshal(protocol.Envelope{Version: protocol.Version, Type: protocol.TypeRoomState, Snapshot: snapshot, Operations: operations, Presence: presence, StateMode: mode, CurrentSequence: current, HistoryStartsAt: historyStart})
}

func broadcast(state *roomState, data []byte, exceptParticipantID string, registry *metrics.Registry) {
	delivered := 0
	for id, participant := range state.clients {
		if id == exceptParticipantID {
			continue
		}
		if participant.Send(data) {
			delivered++
			continue
		}
		delete(state.clients, id)
		delete(state.presence, id)
		participant.Disconnect(protocol.CloseSlowClient, "client cannot keep up")
		registry.ConnectionLeft()
		registry.DroppedSlowClient()
	}
	registry.MessagesBroadcast(delivered)
}

func broadcastPresenceLifecycle(state *roomState, participant Participant, status string, registry *metrics.Registry) {
	payload, _ := json.Marshal(map[string]string{"status": status})
	broadcast(state, protocol.Marshal(protocol.Envelope{Version: protocol.Version, Type: protocol.TypePresence, ActorID: participant.ActorID(), Payload: payload}), participant.ID(), registry)
}

func expiredAt(state roomState, options Options) time.Time {
	idle := state.lastActivityAt.Add(options.IdleTTL)
	hard := state.createdAt.Add(options.MaxTTL)
	if hard.Before(idle) {
		return hard
	}
	return idle
}

func metadata(id, fingerprint string, state roomState, options Options) Metadata {
	return Metadata{ID: id, Fingerprint: fingerprint, CreatedAt: state.createdAt, LastActivityAt: state.lastActivityAt, ExpiresAt: expiredAt(state, options), ParticipantCount: len(state.clients), CurrentSequence: state.nextSequence - 1, Closed: state.closed}
}

func copyState(state roomState) State {
	historyStart := state.snapshotSequence + 1
	if len(state.operations) > 0 {
		historyStart = state.operations[0].Sequence
	}
	return State{Snapshot: append([]byte(nil), state.snapshot...), Operations: append([]protocol.CommittedOperation(nil), state.operations...), CurrentSequence: state.nextSequence - 1, HistoryStartsAt: historyStart, ParticipantCount: len(state.clients)}
}
