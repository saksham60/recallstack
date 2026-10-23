package metrics

import (
	"bytes"
	"strings"
	"testing"
)

func TestOperationalCountersContainNoAccountOrRoomLabels(t *testing.T) {
	r := New()
	r.ConnectionJoined()
	r.ConnectionJoined()
	r.ConnectionLeft()
	r.JoinFailed()
	r.AuthRejected()
	r.CapacityRejected()
	r.HeartbeatTimeout()
	r.SnapshotRecovered()
	r.AckFailed()
	r.TransportFailed()
	s := r.Snapshot()
	if s.ActiveConnections != 1 || s.PeakConnections != 2 || s.JoinFailures != 1 || s.AuthRejections != 1 {
		t.Fatalf("unexpected snapshot: %+v", s)
	}
	var output bytes.Buffer
	if err := r.WritePrometheus(&output); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"join_failures_total", "heartbeat_timeouts_total", "peak_connections"} {
		if !strings.Contains(output.String(), name) {
			t.Fatalf("missing %s", name)
		}
	}
	if strings.Contains(output.String(), "user_id") || strings.Contains(output.String(), "room_token") {
		t.Fatal("high cardinality or secret labels")
	}
}
