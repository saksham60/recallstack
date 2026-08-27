package protocol

import (
	"errors"
	"testing"
)

func TestDecodeClientMessage(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		data string
		code ErrorCode
	}{
		{"valid commit", `{"v":1,"type":"op.commit","opId":"op-1","actorId":"alice","payload":{"kind":"opaque"}}`, ""},
		{"malformed", `{`, ErrorMalformedMessage},
		{"trailing JSON", `{"v":1,"type":"ping","actorId":"alice"}{}`, ErrorMalformedMessage},
		{"unknown field", `{"v":1,"type":"ping","actorId":"alice","extra":true}`, ErrorMalformedMessage},
		{"unsupported version", `{"v":2,"type":"ping","actorId":"alice"}`, ErrorUnsupportedVersion},
		{"actor mismatch", `{"v":1,"type":"ping","actorId":"bob"}`, ErrorActorMismatch},
		{"missing operation id", `{"v":1,"type":"op.commit","actorId":"alice","payload":{}}`, ErrorInvalidOperation},
		{"unsupported type", `{"v":1,"type":"canvas.magic","actorId":"alice","payload":{}}`, ErrorUnsupportedType},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := DecodeClientMessage([]byte(test.data), "alice")
			if test.code == "" {
				if err != nil {
					t.Fatalf("DecodeClientMessage() error = %v", err)
				}
				return
			}
			var messageError *ClientMessageError
			if !errors.As(err, &messageError) || messageError.Code != test.code {
				t.Fatalf("DecodeClientMessage() error = %v, want code %q", err, test.code)
			}
		})
	}
}

func TestValidIdentifier(t *testing.T) {
	t.Parallel()
	if !ValidIdentifier("actor-123") {
		t.Fatal("expected ordinary identifier to be valid")
	}
	for _, invalid := range []string{"", " actor", "actor ", "actor\n", string(make([]byte, 129))} {
		if ValidIdentifier(invalid) {
			t.Fatalf("expected %q to be invalid", invalid)
		}
	}
}
