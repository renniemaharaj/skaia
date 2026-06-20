package notification

import (
	"encoding/json"
	log "github.com/skaia/backend/internal/syslog"
	"strconv"

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

// ProcessMentions extracts mentions and sends notifications.
func (s *Service) ProcessMentions(ids []string, senderID int64, message string, route string) {
	notified := make(map[int64]bool)

	for _, idStr := range ids {
		if idStr == "special-everyone" || idStr == "special-here" {
			users, _ := s.repo.GetAllUserIDs()
			for _, u := range users {
				if u != senderID && !notified[u] {
					_, err := s.Send(u, "mentioned", message, route)
					if err != nil {
						log.Printf("ProcessMentions: failed to send everyone notif to %d: %v", u, err)
					}
					notified[u] = true
				}
			}
			break
		}

		if len(idStr) > 5 && idStr[:5] == "role-" {
			roleID, _ := strconv.ParseInt(idStr[5:], 10, 64)
			users, _ := s.repo.GetUsersByRoleID(roleID)
			for _, u := range users {
				if u != senderID && !notified[u] {
					_, err := s.Send(u, "mentioned", message, route)
					if err != nil {
						log.Printf("ProcessMentions: failed to send role notif to %d: %v", u, err)
					}
					notified[u] = true
				}
			}
			continue
		}

		if len(idStr) > 5 && idStr[:5] == "user-" {
			uID, _ := strconv.ParseInt(idStr[5:], 10, 64)
			if uID != senderID && !notified[uID] {
				_, err := s.Send(uID, "mentioned", message, route)
				if err != nil {
					log.Printf("ProcessMentions: failed to send user notif to %d: %v", uID, err)
				}
				notified[uID] = true
			}
			continue
		}
	}
}
