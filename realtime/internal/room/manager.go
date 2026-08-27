package room

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/saksham60/recallstack/realtime/internal/metrics"
)

var ErrManagerFull = errors.New("maximum active rooms reached")

type Manager struct {
	mu       sync.RWMutex
	rooms    map[string]*Room
	options  Options
	registry *metrics.Registry
	logger   *slog.Logger
	now      func() time.Time
}

type CreatedRoom struct {
	Room      *Room
	RoomID    string
	Token     string
	ExpiresAt time.Time
}

func NewManager(options Options, registry *metrics.Registry, logger *slog.Logger) *Manager {
	return &Manager{rooms: make(map[string]*Room), options: options, registry: registry, logger: logger, now: time.Now}
}

func (m *Manager) Create(snapshot json.RawMessage) (CreatedRoom, error) {
	id, err := randomURLSecret(16)
	if err != nil {
		return CreatedRoom{}, err
	}
	token, err := randomURLSecret(32)
	if err != nil {
		return CreatedRoom{}, err
	}
	fingerprint := tokenFingerprint(token)
	now := m.now()
	m.mu.Lock()
	if len(m.rooms) >= m.options.MaxRooms {
		m.mu.Unlock()
		return CreatedRoom{}, ErrManagerFull
	}
	if _, collision := m.rooms[token]; collision {
		m.mu.Unlock()
		return m.Create(snapshot)
	}
	r := New(id, fingerprint, snapshot, m.options, m.registry, m.logger, now)
	m.rooms[token] = r
	m.mu.Unlock()
	m.registry.RoomCreated()
	created := CreatedRoom{Room: r, RoomID: id, Token: token, ExpiresAt: now.Add(m.options.IdleTTL)}
	m.logger.Info("room created", "room", fingerprint, "active_rooms", m.Count())
	return created, nil
}

func (m *Manager) Find(token string) (*Room, bool) {
	m.mu.RLock()
	r, ok := m.rooms[token]
	m.mu.RUnlock()
	return r, ok
}

func (m *Manager) Remove(ctx context.Context, token string, reason string) bool {
	m.mu.Lock()
	r, ok := m.rooms[token]
	if ok {
		delete(m.rooms, token)
	}
	m.mu.Unlock()
	if !ok {
		return false
	}
	_ = r.Stop(ctx, reason)
	m.registry.RoomRemoved(false)
	return true
}

func (m *Manager) Count() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.rooms)
}

func (m *Manager) StartCleanup(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case now := <-ticker.C:
			m.CleanupNow(ctx, now)
		case <-ctx.Done():
			return
		}
	}
}

func (m *Manager) CleanupNow(ctx context.Context, now time.Time) int {
	m.mu.RLock()
	candidates := make(map[string]*Room, len(m.rooms))
	for token, r := range m.rooms {
		candidates[token] = r
	}
	m.mu.RUnlock()
	removed := 0
	for token, r := range candidates {
		expired, err := r.ExpireIfNeeded(ctx, now)
		if err != nil || !expired {
			continue
		}
		deleted := false
		m.mu.Lock()
		if current, ok := m.rooms[token]; ok && current == r {
			delete(m.rooms, token)
			removed++
			deleted = true
		}
		m.mu.Unlock()
		if deleted {
			m.registry.RoomRemoved(true)
			m.logger.Info("room expired", "room", r.Fingerprint(), "active_rooms", m.Count())
		}
	}
	return removed
}

func (m *Manager) Close(ctx context.Context) error {
	m.mu.Lock()
	rooms := m.rooms
	m.rooms = make(map[string]*Room)
	m.mu.Unlock()
	var joined error
	for _, r := range rooms {
		if err := r.Stop(ctx, "server shutting down"); err != nil {
			joined = errors.Join(joined, err)
		}
		m.registry.RoomRemoved(false)
	}
	return joined
}

func randomURLSecret(bytes int) (string, error) {
	value := make([]byte, bytes)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(value), nil
}

func tokenFingerprint(token string) string {
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:4])
}
