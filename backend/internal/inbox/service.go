package inbox

import (
	"encoding/json"
	"errors"

	"github.com/skaia/backend/internal/ws"
	"github.com/skaia/backend/models"
)

var errForbidden = errors.New("forbidden")

// Service coordinates inbox repository access and real-time delivery.
type Service struct {
	repo    Repository
	hub     *ws.Hub
	userSvc UserGetter
}

// UserGetter is the minimal interface the inbox service needs from the user domain.
type UserGetter interface {
	GetByID(id int64) (*models.User, error)
	GetByUsername(username string) (*models.User, error)
}

// NewService creates a Service.
func NewService(repo Repository, hub *ws.Hub, userSvc UserGetter) *Service {
	return &Service{repo: repo, hub: hub, userSvc: userSvc}
}

// GetOrStartConversation returns or creates a conversation between the two users.
func (s *Service) GetOrStartConversation(user1ID, user2ID int64) (*models.InboxConversation, error) {
	return s.repo.GetOrCreateConversation(user1ID, user2ID)
}

// FindUserByUsername looks up a user by username.
func (s *Service) FindUserByUsername(username string) (*models.User, error) {
	return s.userSvc.GetByUsername(username)
}

// GetConversation returns a conversation by ID, checking the caller is a participant.
func (s *Service) GetConversation(id, callerID int64) (*models.InboxConversation, error) {
	c, err := s.repo.GetConversation(id)
	if err != nil {
		return nil, err
	}
	if c.User1ID != callerID && c.User2ID != callerID {
		return nil, errForbidden
	}
	return c, nil
}

// ListConversations returns all conversations enriched with the other user and last message.
func (s *Service) ListConversations(userID int64) ([]*models.InboxConversation, error) {
	convs, err := s.repo.ListConversations(userID)
	if err != nil {
		return nil, err
	}
	for _, c := range convs {
		otherID := c.User2ID
		if c.User1ID != userID {
			otherID = c.User1ID
		}
		if u, err := s.userSvc.GetByID(otherID); err == nil {
			c.OtherUser = u
		}
		msgs, err := s.repo.ListMessages(c.ID, 1, 0)
		if err == nil && len(msgs) > 0 {
			c.LastMessage = msgs[0]
			if u, err := s.userSvc.GetByID(msgs[0].SenderID); err == nil {
				msgs[0].SenderName = u.DisplayName
				msgs[0].SenderAvatar = u.AvatarURL
			}
		}
		// use COUNT query instead of fetching all messages
		if count, err := s.repo.UnreadCount(c.ID, userID); err == nil {
			c.UnreadCount = count
		}
	}
	return convs, nil
}

// ListMessages returns paginated messages for a conversation, enriched with sender info.
// Messages are returned oldest-first (DESC from DB, reversed here) matching the thread comment UX.
func (s *Service) ListMessages(conversationID, callerID, limit, offset int64) ([]*models.InboxMessage, error) {
	c, err := s.repo.GetConversation(conversationID)
	if err != nil {
		return nil, err
	}
	if c.User1ID != callerID && c.User2ID != callerID {
		return nil, errForbidden
	}
	msgs, err := s.repo.ListMessages(conversationID, int(limit), int(offset))
	if err != nil {
		return nil, err
	}
	// Enrich sender info
	for _, m := range msgs {
		if u, err := s.userSvc.GetByID(m.SenderID); err == nil {
			m.SenderName = u.DisplayName
			m.SenderAvatar = u.AvatarURL
		}
	}
	return msgs, nil
}

// SendMessage creates a message and propagates it to conversation subscribers.
func (s *Service) SendMessage(content string, conversationID, senderID int64) (*models.InboxMessage, error) {
	c, err := s.repo.GetConversation(conversationID)
	if err != nil {
		return nil, err
	}
	if c.User1ID != senderID && c.User2ID != senderID {
		return nil, errForbidden
	}

	msg := &models.InboxMessage{
		ConversationID: conversationID,
		SenderID:       senderID,
		Content:        content,
	}
	created, err := s.repo.CreateMessage(msg)
	if err != nil {
		return nil, err
	}

	// Enrich sender
	if u, err := s.userSvc.GetByID(senderID); err == nil {
		created.SenderName = u.DisplayName
		created.SenderAvatar = u.AvatarURL
	}

	// Push to conversation subscribers (both parties if they have the conversation open)
	s.hub.PropagateInboxConversation(conversationID, created, "message_created")

	// Also push a direct inbox notification to the recipient so they see
	// the unread badge even when the conversation isn't open.
	recipientID := c.User2ID
	if c.User2ID == senderID {
		recipientID = c.User1ID
	}
	if payload, err2 := json.Marshal(created); err2 == nil {
		notifMsg := &ws.Message{Type: ws.InboxMsg, Payload: payload}
		s.hub.SendToUser(recipientID, notifMsg)
	}

	return created, nil
}

// DeleteMessage removes a message the caller sent.
func (s *Service) DeleteMessage(id, senderID int64) error {
	return s.repo.DeleteMessage(id, senderID)
}

// MarkRead marks all messages from the other user as read.
func (s *Service) MarkRead(conversationID, callerID int64) error {
	c, err := s.repo.GetConversation(conversationID)
	if err != nil {
		return err
	}
	if c.User1ID != callerID && c.User2ID != callerID {
		return errForbidden
	}
	return s.repo.MarkConversationRead(conversationID, callerID)
}

// UnreadTotal returns the total unread message count across all conversations.
func (s *Service) UnreadTotal(userID int64) (int, error) {
	return s.repo.UnreadTotal(userID)
}
