package room

import "github.com/saksham60/recallstack/realtime/internal/protocol"

type HandleResult struct {
	Sequence  uint64
	Duplicate bool
}

type State struct {
	Snapshot         []byte
	Operations       []protocol.CommittedOperation
	CurrentSequence  uint64
	HistoryStartsAt  uint64
	ParticipantCount int
}
