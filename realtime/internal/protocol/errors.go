package protocol

type ErrorCode string

const (
	ErrorMalformedMessage   ErrorCode = "malformed_message"
	ErrorUnsupportedVersion ErrorCode = "unsupported_protocol_version"
	ErrorUnsupportedType    ErrorCode = "unsupported_message_type"
	ErrorActorMismatch      ErrorCode = "actor_mismatch"
	ErrorInvalidOperation   ErrorCode = "invalid_operation"
	ErrorRoomNotFound       ErrorCode = "room_not_found"
	ErrorRoomExpired        ErrorCode = "room_expired"
	ErrorRoomFull           ErrorCode = "room_full"
	ErrorServerCapacity     ErrorCode = "server_capacity"
	ErrorRateLimited        ErrorCode = "rate_limited"
	ErrorSlowClient         ErrorCode = "slow_client"
	ErrorCheckpointRequired ErrorCode = "checkpoint_required"
	ErrorInternal           ErrorCode = "internal_error"
)

const (
	CloseMalformedMessage   = 4400
	CloseUnsupportedVersion = 4401
	CloseActorMismatch      = 4403
	CloseRoomNotFound       = 4404
	CloseRoomExpired        = 4408
	CloseRoomFull           = 4430
	CloseRateLimited        = 4429
	CloseSlowClient         = 4409
	CloseInternal           = 4500
)

type ErrorBody struct {
	Code    ErrorCode `json:"code"`
	Message string    `json:"message"`
}

type ClientMessageError struct {
	Code      ErrorCode
	CloseCode int
	Message   string
}

func (e *ClientMessageError) Error() string { return e.Message }
