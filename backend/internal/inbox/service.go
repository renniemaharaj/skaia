package inbox

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/skaia/backend/internal/ws"
	"github.com/skaia/backend/models"
)

var errForbidden = errors.New("forbidden")
var errBlocked = errors.New("blocked")

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
	blocked, err := s.repo.IsBlockedEither(user1ID, user2ID)
	if err != nil {
		return nil, err
	}
	if blocked {
		return nil, errBlocked
	}
	conv, err := s.repo.GetOrCreateConversation(user1ID, user2ID)
	if err != nil {
		return nil, err
	}
	// Enrich the other user so the frontend has display info immediately.
	otherID := user2ID
	if conv.User1ID != user1ID {
		otherID = user1ID
	}
	// user1ID is always the caller here
	if otherID == user1ID {
		otherID = user2ID
	}
	if u, err := s.userSvc.GetByID(otherID); err == nil {
		conv.OtherUser = u
	}
	if err := s.populateBlockState(conv, user1ID); err == nil {
		return conv, nil
	}
	return conv, nil
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
	_ = s.populateBlockState(c, callerID)
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
		_ = s.populateBlockState(c, userID)
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
func (s *Service) SendMessage(msg *models.InboxMessage) (*models.InboxMessage, error) {
	c, err := s.repo.GetConversation(msg.ConversationID)
	if err != nil {
		return nil, err
	}
	if c.User1ID != msg.SenderID && c.User2ID != msg.SenderID {
		return nil, errForbidden
	}

	blocked, err := s.repo.IsBlockedEither(c.User1ID, c.User2ID)
	if err != nil {
		return nil, err
	}
	if blocked {
		return nil, errBlocked
	}

	created, err := s.repo.CreateMessage(msg)
	if err != nil {
		return nil, err
	}

	// Enrich sender
	if u, err := s.userSvc.GetByID(msg.SenderID); err == nil {
		created.SenderName = u.DisplayName
		created.SenderAvatar = u.AvatarURL
	}

	// Push to conversation subscribers (both parties if they have the conversation open)
	s.hub.PropagateInboxConversation(msg.ConversationID, created, "message_created")

	// Also push a direct inbox notification to the recipient so they see
	// the unread badge even when the conversation isn't open.
	recipientID := c.User2ID
	if c.User2ID == msg.SenderID {
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

// DeleteConversation deletes a conversation and all its messages.
func (s *Service) DeleteConversation(conversationID, callerID int64) error {
	c, err := s.repo.GetConversation(conversationID)
	if err != nil {
		return err
	}
	if c.User1ID != callerID && c.User2ID != callerID {
		return errForbidden
	}
	return s.repo.DeleteConversation(conversationID)
}

func (s *Service) populateBlockState(c *models.InboxConversation, callerID int64) error {
	otherID := c.User2ID
	if c.User1ID != callerID {
		otherID = c.User1ID
	}
	blockedByCurrentUser, err := s.repo.IsBlocked(callerID, otherID)
	if err != nil {
		return err
	}
	blockedByOtherUser, err := s.repo.IsBlocked(otherID, callerID)
	if err != nil {
		return err
	}
	c.BlockedByCurrentUser = blockedByCurrentUser
	c.BlockedByOtherUser = blockedByOtherUser
	return nil
}

// BlockUser blocks a user and returns an error if already blocked.
func (s *Service) BlockUser(blockerID, blockedID int64) error {
	if blockerID == blockedID {
		return errors.New("cannot block yourself")
	}
	return s.repo.BlockUser(blockerID, blockedID)
}

// UnblockUser removes a block.
func (s *Service) UnblockUser(blockerID, blockedID int64) error {
	return s.repo.UnblockUser(blockerID, blockedID)
}

// IsBlocked checks if blocker has blocked blocked.
func (s *Service) IsBlocked(blockerID, blockedID int64) (bool, error) {
	return s.repo.IsBlocked(blockerID, blockedID)
}

// ListBlockedUsers returns the IDs of users this user has blocked, enriched with user details.
func (s *Service) ListBlockedUsers(blockerID int64) ([]*models.User, error) {
	ids, err := s.repo.ListBlockedUsers(blockerID)
	if err != nil {
		return nil, err
	}
	var users []*models.User
	for _, id := range ids {
		if u, err := s.userSvc.GetByID(id); err == nil {
			users = append(users, u)
		}
	}
	return users, nil
}

// SendSystemMessage creates a conversation between senderID (system/noreply) and
// recipientID, then inserts a message. It skips block checks since the sender is
// a system account. The message is propagated in real-time.
func (s *Service) SendSystemMessage(senderID, recipientID int64, content, messageType string) error {
	if messageType == "" {
		messageType = "text"
	}
	conv, err := s.repo.GetOrCreateConversation(senderID, recipientID)
	if err != nil {
		return err
	}
	msg, err := s.repo.CreateMessage(&models.InboxMessage{
		ConversationID: conv.ID,
		SenderID:       senderID,
		Content:        content,
		MessageType:    messageType,
	})
	if err != nil {
		return err
	}

	// Enrich sender for real-time delivery
	if u, err := s.userSvc.GetByID(senderID); err == nil {
		msg.SenderName = u.DisplayName
		msg.SenderAvatar = u.AvatarURL
	}

	s.hub.PropagateInboxConversation(conv.ID, msg, "message_created")

	if payload, err2 := json.Marshal(msg); err2 == nil {
		notifMsg := &ws.Message{Type: ws.InboxMsg, Payload: payload}
		s.hub.SendToUser(recipientID, notifMsg)
	}
	return nil
}

// SendNoreplyToUser delivers an automated message to a user's inbox from the
// system "noreply" account. The noreply user must exist (seeded in 002_seed.sql).
func (s *Service) SendNoreplyToUser(recipientID int64, content string) error {
	noreply, err := s.userSvc.GetByUsername("noreply")
	if err != nil {
		return fmt.Errorf("noreply user not found: %w", err)
	}
	return s.SendSystemMessage(noreply.ID, recipientID, content, "text")
}
