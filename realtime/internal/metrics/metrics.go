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
	joinFailures        atomic.Uint64
	capacityRejections  atomic.Uint64
	authRejections      atomic.Uint64
	heartbeatTimeouts   atomic.Uint64
	transportFailures   atomic.Uint64
	snapshotRecoveries  atomic.Uint64
	ackFailures         atomic.Uint64
	peakConnections     atomic.Int64
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
	JoinFailures        uint64
	CapacityRejections  uint64
	AuthRejections      uint64
	HeartbeatTimeouts   uint64
	TransportFailures   uint64
	SnapshotRecoveries  uint64
	AckFailures         uint64
	PeakConnections     int64
}

func New() *Registry { return &Registry{} }

func (r *Registry) RoomCreated() { r.activeRooms.Add(1); r.roomsCreated.Add(1) }
func (r *Registry) RoomRemoved(expired bool) {
	r.activeRooms.Add(-1)
	if expired {
		r.roomsExpired.Add(1)
	}
}
func (r *Registry) ConnectionJoined() {
	active := r.activeConnections.Add(1)
	for peak := r.peakConnections.Load(); active > peak; peak = r.peakConnections.Load() {
		if r.peakConnections.CompareAndSwap(peak, active) {
			break
		}
	}
}
func (r *Registry) ConnectionLeft()  { r.activeConnections.Add(-1) }
func (r *Registry) MessageReceived() { r.messagesReceived.Add(1) }
func (r *Registry) MessagesBroadcast(count int) {
	if count > 0 {
		r.messagesBroadcast.Add(uint64(count))
	}
}
func (r *Registry) CommittedOperation() { r.committedOperations.Add(1) }
func (r *Registry) EphemeralOperation() { r.ephemeralOperations.Add(1) }
func (r *Registry) Reconnect()          { r.reconnects.Add(1) }
func (r *Registry) DroppedSlowClient()  { r.droppedSlowClients.Add(1) }
func (r *Registry) JoinFailed()         { r.joinFailures.Add(1) }
func (r *Registry) CapacityRejected()   { r.capacityRejections.Add(1) }
func (r *Registry) AuthRejected()       { r.authRejections.Add(1) }
func (r *Registry) HeartbeatTimeout()   { r.heartbeatTimeouts.Add(1) }
func (r *Registry) TransportFailed()    { r.transportFailures.Add(1) }
func (r *Registry) SnapshotRecovered()  { r.snapshotRecoveries.Add(1) }
func (r *Registry) AckFailed()          { r.ackFailures.Add(1) }

func (r *Registry) Snapshot() Snapshot {
	return Snapshot{
		ActiveRooms: r.activeRooms.Load(), ActiveConnections: r.activeConnections.Load(),
		RoomsCreated: r.roomsCreated.Load(), RoomsExpired: r.roomsExpired.Load(),
		MessagesReceived: r.messagesReceived.Load(), MessagesBroadcast: r.messagesBroadcast.Load(),
		CommittedOperations: r.committedOperations.Load(), EphemeralOperations: r.ephemeralOperations.Load(),
		Reconnects: r.reconnects.Load(), DroppedSlowClients: r.droppedSlowClients.Load(),
		JoinFailures: r.joinFailures.Load(), CapacityRejections: r.capacityRejections.Load(),
		AuthRejections: r.authRejections.Load(), HeartbeatTimeouts: r.heartbeatTimeouts.Load(),
		TransportFailures: r.transportFailures.Load(), SnapshotRecoveries: r.snapshotRecoveries.Load(),
		AckFailures: r.ackFailures.Load(), PeakConnections: r.peakConnections.Load(),
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
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(w, `# TYPE recallstack_realtime_join_failures_total counter
recallstack_realtime_join_failures_total %d
# TYPE recallstack_realtime_capacity_rejections_total counter
recallstack_realtime_capacity_rejections_total %d
# TYPE recallstack_realtime_auth_rejections_total counter
recallstack_realtime_auth_rejections_total %d
# TYPE recallstack_realtime_heartbeat_timeouts_total counter
recallstack_realtime_heartbeat_timeouts_total %d
# TYPE recallstack_realtime_transport_failures_total counter
recallstack_realtime_transport_failures_total %d
# TYPE recallstack_realtime_snapshot_recoveries_total counter
recallstack_realtime_snapshot_recoveries_total %d
# TYPE recallstack_realtime_ack_failures_total counter
recallstack_realtime_ack_failures_total %d
# TYPE recallstack_realtime_peak_connections gauge
recallstack_realtime_peak_connections %d
`, s.JoinFailures, s.CapacityRejections, s.AuthRejections, s.HeartbeatTimeouts,
		s.TransportFailures, s.SnapshotRecoveries, s.AckFailures, s.PeakConnections)
	return err
}
