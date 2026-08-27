package websocket

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"time"

	coderws "github.com/coder/websocket"

	"github.com/saksham60/recallstack/realtime/internal/metrics"
	"github.com/saksham60/recallstack/realtime/internal/protocol"
)

type ClientOptions struct {
	SendQueueCapacity    int
	MaxMessageBytes      int64
	MaxMessagesPerSecond int
	PingInterval         time.Duration
	PongTimeout          time.Duration
	WriteTimeout         time.Duration
}

type closeRequest struct {
	code   coderws.StatusCode
	reason string
}

type Client struct {
	id       string
	actorID  string
	conn     *coderws.Conn
	send     chan []byte
	close    chan closeRequest
	options  ClientOptions
	registry *metrics.Registry
}

func NewClient(actorID string, conn *coderws.Conn, options ClientOptions, registry *metrics.Registry) (*Client, error) {
	id, err := connectionID()
	if err != nil {
		return nil, err
	}
	conn.SetReadLimit(options.MaxMessageBytes)
	return &Client{id: id, actorID: actorID, conn: conn, send: make(chan []byte, options.SendQueueCapacity), close: make(chan closeRequest, 1), options: options, registry: registry}, nil
}

func (c *Client) ID() string      { return c.id }
func (c *Client) ActorID() string { return c.actorID }

func (c *Client) Send(message []byte) bool {
	copyOfMessage := append([]byte(nil), message...)
	select {
	case c.send <- copyOfMessage:
		return true
	default:
		return false
	}
}

func (c *Client) Disconnect(closeCode int, reason string) {
	select {
	case c.close <- closeRequest{coderws.StatusCode(closeCode), reason}:
	default:
	}
}

func (c *Client) Run(ctx context.Context, onMessage func(context.Context, protocol.Envelope) error) error {
	runContext, cancel := context.WithCancel(ctx)
	defer cancel()

	readDone := make(chan error, 1)
	writerDone := make(chan error, 1)
	go func() { readDone <- c.readLoop(runContext, onMessage) }()
	go func() { writerDone <- c.writeLoop(runContext) }()
	select {
	case readErr := <-readDone:
		cancel()
		writerErr := <-writerDone
		if readErr != nil {
			return readErr
		}
		return writerErr
	case writerErr := <-writerDone:
		cancel()
		readErr := <-readDone
		if writerErr != nil {
			return writerErr
		}
		return readErr
	}
}

func (c *Client) readLoop(ctx context.Context, onMessage func(context.Context, protocol.Envelope) error) error {
	windowStarted := time.Now()
	messagesInWindow := 0
	for {
		messageType, data, err := c.conn.Read(ctx)
		if err != nil {
			status := coderws.CloseStatus(err)
			if status == coderws.StatusNormalClosure || status == coderws.StatusGoingAway || errors.Is(err, context.Canceled) {
				return nil
			}
			return err
		}
		if messageType != coderws.MessageText {
			return &protocol.ClientMessageError{Code: protocol.ErrorMalformedMessage, CloseCode: protocol.CloseMalformedMessage, Message: "only text JSON messages are supported"}
		}
		now := time.Now()
		if now.Sub(windowStarted) >= time.Second {
			windowStarted = now
			messagesInWindow = 0
		}
		messagesInWindow++
		if messagesInWindow > c.options.MaxMessagesPerSecond {
			return &protocol.ClientMessageError{Code: protocol.ErrorRateLimited, CloseCode: protocol.CloseRateLimited, Message: "message rate limit exceeded"}
		}
		c.registry.MessageReceived()
		message, err := protocol.DecodeClientMessage(data, c.actorID)
		if err != nil {
			return err
		}
		if err := onMessage(ctx, message); err != nil {
			return err
		}
	}
}

func (c *Client) writeLoop(ctx context.Context) error {
	ticker := time.NewTicker(c.options.PingInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return nil
		case request := <-c.close:
			return c.conn.Close(request.code, truncateReason(request.reason))
		case message := <-c.send:
			writeContext, cancel := context.WithTimeout(ctx, c.options.WriteTimeout)
			err := c.conn.Write(writeContext, coderws.MessageText, message)
			cancel()
			if err != nil {
				return err
			}
		case <-ticker.C:
			pingContext, cancel := context.WithTimeout(ctx, c.options.PongTimeout)
			err := c.conn.Ping(pingContext)
			cancel()
			if err != nil {
				return fmt.Errorf("websocket heartbeat: %w", err)
			}
		}
	}
}

func (c *Client) CloseWithError(err error) {
	var messageError *protocol.ClientMessageError
	if errors.As(err, &messageError) {
		_ = c.conn.Close(coderws.StatusCode(messageError.CloseCode), truncateReason(messageError.Message))
		return
	}
	if status := coderws.CloseStatus(err); status == coderws.StatusMessageTooBig {
		_ = c.conn.Close(coderws.StatusMessageTooBig, "message exceeds configured size limit")
		return
	}
	_ = c.conn.Close(coderws.StatusInternalError, "connection closed")
}

func connectionID() (string, error) {
	value := make([]byte, 12)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

func truncateReason(reason string) string {
	if len(reason) <= 120 {
		return reason
	}
	return reason[:120]
}
