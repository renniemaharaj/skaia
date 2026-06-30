package streammeta

import (
	"crypto/rand"
	"encoding/hex"
	"strings"
	"sync"
	"time"
)

type Meta struct {
	ID          string    `json:"id"`
	Route       string    `json:"route"`
	ShareURL    string    `json:"share_url"`
	OwnerID     int64     `json:"owner_id,omitempty"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Thumbnail   []byte    `json:"-"`
	ThumbMIME   string    `json:"thumb_mime,omitempty"`
	Revision    string    `json:"revision"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Update struct {
	ID          string
	OwnerID     int64
	Title       string
	Description string
	Thumbnail   []byte
	ThumbMIME   string
}

type Store struct {
	mu    sync.RWMutex
	items map[string]Meta
}

func NewStore() *Store {
	return &Store{items: make(map[string]Meta)}
}

func (s *Store) Create(ownerID int64) Meta {
	id := newID()
	now := time.Now().UTC()
	meta := Meta{
		ID:        id,
		Route:     "/stream/" + id,
		ShareURL:  "/stream/" + id,
		OwnerID:   ownerID,
		Revision:  newID(),
		UpdatedAt: now,
	}

	s.mu.Lock()
	s.items[id] = meta
	s.mu.Unlock()
	return meta
}

func (s *Store) Upsert(update Update) (Meta, bool) {
	now := time.Now().UTC()

	s.mu.Lock()
	defer s.mu.Unlock()

	meta, ok := s.items[update.ID]
	if !ok {
		return Meta{}, false
	}
	if meta.OwnerID != update.OwnerID {
		return Meta{}, false
	}

	meta.Title = clean(update.Title, 120)
	meta.Description = clean(update.Description, 280)
	if len(update.Thumbnail) > 0 {
		meta.Thumbnail = update.Thumbnail
		meta.ThumbMIME = clean(update.ThumbMIME, 80)
	}
	meta.Revision = newID()
	meta.ShareURL = meta.Route + "?v=" + meta.Revision
	meta.UpdatedAt = now
	s.items[meta.ID] = meta
	return meta, true
}

func (s *Store) Get(id string) (Meta, bool) {
	s.mu.RLock()
	meta, ok := s.items[id]
	s.mu.RUnlock()
	return meta, ok
}

func (s *Store) OwnerIDForRoute(route string) (int64, bool) {
	id, ok := IDFromRoute(route)
	if !ok {
		return 0, false
	}
	meta, ok := s.Get(id)
	if !ok || meta.OwnerID <= 0 {
		return 0, false
	}
	return meta.OwnerID, true
}

func IDFromRoute(route string) (string, bool) {
	route = strings.TrimSpace(strings.Split(route, "?")[0])
	route = strings.TrimSuffix(route, "/")
	if !strings.HasPrefix(route, "/stream/") {
		return "", false
	}
	id := strings.TrimPrefix(route, "/stream/")
	if id == "" || strings.Contains(id, "/") {
		return "", false
	}
	return id, true
}

func clean(value string, max int) string {
	value = strings.TrimSpace(value)
	if len(value) <= max {
		return value
	}
	return value[:max]
}

func newID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return hex.EncodeToString([]byte(time.Now().UTC().Format("20060102150405.000000000")))
	}
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return hex.EncodeToString(b[0:4]) + "-" +
		hex.EncodeToString(b[4:6]) + "-" +
		hex.EncodeToString(b[6:8]) + "-" +
		hex.EncodeToString(b[8:10]) + "-" +
		hex.EncodeToString(b[10:16])
}

var DefaultStore = NewStore()
