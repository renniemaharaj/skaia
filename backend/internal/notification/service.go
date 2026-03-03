package notification

import (
	"encoding/json"

	"github.com/skaia/backend/internal/ws"
	"github.com/skaia/backend/models"
)

// Service coordinates notification storage and real-time delivery.
type Service struct {
	repo Repository
	hub  *ws.Hub
}

// NewService creates a Service.
func NewService(repo Repository, hub *ws.Hub) *Service {
	return &Service{repo: repo, hub: hub}
}

// Send creates a notification in the DB and pushes it to the recipient via WS.
func (s *Service) Send(userID int64, notifType, message, route string) (*models.Notification, error) {
	n := &models.Notification{
		UserID:  userID,
		Type:    notifType,
		Message: message,
		Route:   route,
	}
	created, err := s.repo.Create(n)
	if err != nil {
		return nil, err
	}
	// Non-blocking WS push
	payload, _ := json.Marshal(created)
	msg := &ws.Message{Type: ws.NotificationMsg, Payload: payload}
	s.hub.SendToUser(userID, msg)
	return created, nil
}

func (s *Service) List(userID int64, limit, offset int) ([]*models.Notification, error) {
	return s.repo.GetByUser(userID, limit, offset)
}

func (s *Service) MarkRead(id, userID int64) error {
	return s.repo.MarkRead(id, userID)
}

func (s *Service) MarkAllRead(userID int64) error {
	return s.repo.MarkAllRead(userID)
}

func (s *Service) Delete(id, userID int64) error {
	return s.repo.Delete(id, userID)
}

func (s *Service) DeleteAll(userID int64) error {
	return s.repo.DeleteAll(userID)
}

func (s *Service) UnreadCount(userID int64) (int, error) {
	return s.repo.UnreadCount(userID)
}
