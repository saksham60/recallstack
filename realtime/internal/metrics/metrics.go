package metrics

import (
	"fmt"
	"io"
	"sync/atomic"
)

type Registry struct {
	activeRooms         atomic.Int64
	activeConnections   atomic.Int64
	roomsCreated        atomic.Uint64
	roomsExpired        atomic.Uint64
	messagesReceived    atomic.Uint64
	messagesBroadcast   atomic.Uint64
	committedOperations atomic.Uint64
	ephemeralOperations atomic.Uint64
	reconnects          atomic.Uint64
	droppedSlowClients  atomic.Uint64
}

type Snapshot struct {
	ActiveRooms         int64
	ActiveConnections   int64
	RoomsCreated        uint64
	RoomsExpired        uint64
	MessagesReceived    uint64
	MessagesBroadcast   uint64
	CommittedOperations uint64
	EphemeralOperations uint64
	Reconnects          uint64
	DroppedSlowClients  uint64
}

func New() *Registry { return &Registry{} }

func (r *Registry) RoomCreated() { r.activeRooms.Add(1); r.roomsCreated.Add(1) }
func (r *Registry) RoomRemoved(expired bool) {
	r.activeRooms.Add(-1)
	if expired {
		r.roomsExpired.Add(1)
	}
}
func (r *Registry) ConnectionJoined() { r.activeConnections.Add(1) }
func (r *Registry) ConnectionLeft()   { r.activeConnections.Add(-1) }
func (r *Registry) MessageReceived()  { r.messagesReceived.Add(1) }
func (r *Registry) MessagesBroadcast(count int) {
	if count > 0 {
		r.messagesBroadcast.Add(uint64(count))
	}
}
func (r *Registry) CommittedOperation() { r.committedOperations.Add(1) }
func (r *Registry) EphemeralOperation() { r.ephemeralOperations.Add(1) }
func (r *Registry) Reconnect()          { r.reconnects.Add(1) }
func (r *Registry) DroppedSlowClient()  { r.droppedSlowClients.Add(1) }

func (r *Registry) Snapshot() Snapshot {
	return Snapshot{
		ActiveRooms: r.activeRooms.Load(), ActiveConnections: r.activeConnections.Load(),
		RoomsCreated: r.roomsCreated.Load(), RoomsExpired: r.roomsExpired.Load(),
		MessagesReceived: r.messagesReceived.Load(), MessagesBroadcast: r.messagesBroadcast.Load(),
		CommittedOperations: r.committedOperations.Load(), EphemeralOperations: r.ephemeralOperations.Load(),
		Reconnects: r.reconnects.Load(), DroppedSlowClients: r.droppedSlowClients.Load(),
	}
}

func (r *Registry) WritePrometheus(w io.Writer) error {
	s := r.Snapshot()
	_, err := fmt.Fprintf(w, `# TYPE recallstack_realtime_active_rooms gauge
recallstack_realtime_active_rooms %d
# TYPE recallstack_realtime_active_connections gauge
recallstack_realtime_active_connections %d
# TYPE recallstack_realtime_rooms_created_total counter
recallstack_realtime_rooms_created_total %d
# TYPE recallstack_realtime_rooms_expired_total counter
recallstack_realtime_rooms_expired_total %d
# TYPE recallstack_realtime_messages_received_total counter
recallstack_realtime_messages_received_total %d
# TYPE recallstack_realtime_messages_broadcast_total counter
recallstack_realtime_messages_broadcast_total %d
# TYPE recallstack_realtime_committed_operations_total counter
recallstack_realtime_committed_operations_total %d
# TYPE recallstack_realtime_ephemeral_operations_total counter
recallstack_realtime_ephemeral_operations_total %d
# TYPE recallstack_realtime_reconnects_total counter
recallstack_realtime_reconnects_total %d
# TYPE recallstack_realtime_dropped_slow_clients_total counter
recallstack_realtime_dropped_slow_clients_total %d
`, s.ActiveRooms, s.ActiveConnections, s.RoomsCreated, s.RoomsExpired,
		s.MessagesReceived, s.MessagesBroadcast, s.CommittedOperations,
		s.EphemeralOperations, s.Reconnects, s.DroppedSlowClients)
	return err
}
