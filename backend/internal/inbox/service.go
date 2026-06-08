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
	participantRows, err := s.repo.GetParticipants(conv.ID)
	if err == nil {
		for _, row := range participantRows {
			if u, err := s.userSvc.GetByID(row.UserID); err == nil {
				conv.Participants = append(conv.Participants, &models.InboxParticipant{
					User:    *u,
					Role:    row.Role,
					IsMuted: row.IsMuted,
				})
				if row.UserID != user1ID && conv.OtherUser == nil {
					conv.OtherUser = u
				}
			}
		}
	}
	if err := s.populateBlockState(conv, user1ID); err == nil {
		return conv, nil
	}
	return conv, nil
}

func (s *Service) CreateGroupConversation(creatorID int64, participantIDs []int64, title string) (*models.InboxConversation, error) {
	hasCreator := false
	for _, id := range participantIDs {
		if id == creatorID {
			hasCreator = true
		} else {
			blocked, err := s.repo.IsBlockedEither(creatorID, id)
			if err == nil && blocked {
				return nil, fmt.Errorf("cannot add user %d due to block settings", id)
			}
		}
	}
	if !hasCreator {
		participantIDs = append(participantIDs, creatorID)
	}

	conv, err := s.repo.CreateGroupConversation(title, creatorID, participantIDs)
	if err != nil {
		return nil, err
	}
	
	participantRows, _ := s.repo.GetParticipants(conv.ID)
	for _, row := range participantRows {
		if u, err := s.userSvc.GetByID(row.UserID); err == nil {
			conv.Participants = append(conv.Participants, &models.InboxParticipant{
				User:    *u,
				Role:    row.Role,
				IsMuted: row.IsMuted,
			})
		}
	}

	msg, _ := s.repo.CreateMessage(&models.InboxMessage{
		ConversationID: conv.ID,
		SenderID:       creatorID,
		Content:        fmt.Sprintf("created this group with %d other(s)", len(participantIDs)-1),
		MessageType:    "system_group_created",
	})
	if msg != nil {
		if u, err := s.userSvc.GetByID(creatorID); err == nil {
			msg.SenderName = u.DisplayName
			msg.SenderAvatar = u.AvatarURL
		}
		s.hub.PropagateInboxConversation(conv.ID, msg, "message_created")
		for _, pid := range participantIDs {
			if payload, err2 := json.Marshal(msg); err2 == nil {
				notifMsg := &ws.Message{Type: ws.InboxMsg, Payload: payload}
				s.hub.SendToUser(pid, notifMsg)
			}
			if payload, err2 := json.Marshal(map[string]interface{}{
				"action": "conversation_created",
				"data":   conv,
			}); err2 == nil {
				s.hub.SendToUser(pid, &ws.Message{Type: ws.InboxUpdate, Payload: payload})
			}
		}
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
	participantRows, err := s.repo.GetParticipants(id)
	if err != nil {
		return nil, err
	}
	isParticipant := false
	for _, row := range participantRows {
		if row.UserID == callerID {
			isParticipant = true
		}
		if u, err := s.userSvc.GetByID(row.UserID); err == nil {
			c.Participants = append(c.Participants, &models.InboxParticipant{
				User:    *u,
				Role:    row.Role,
				IsMuted: row.IsMuted,
			})
			if row.UserID != callerID && c.OtherUser == nil {
				c.OtherUser = u
			}
		}
	}
	if !isParticipant {
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
		participantRows, _ := s.repo.GetParticipants(c.ID)
		for _, row := range participantRows {
			if u, err := s.userSvc.GetByID(row.UserID); err == nil {
				c.Participants = append(c.Participants, &models.InboxParticipant{
					User:    *u,
					Role:    row.Role,
					IsMuted: row.IsMuted,
				})
				if row.UserID != userID && c.OtherUser == nil {
					c.OtherUser = u
				}
			}
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
	_, err := s.GetConversation(conversationID, callerID)
	if err != nil {
		return nil, err
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
	c, err := s.GetConversation(msg.ConversationID, msg.SenderID)
	if err != nil {
		return nil, err
	}

	if c.IsLocked {
		return nil, fmt.Errorf("conversation is locked")
	}

	// For groups, check if muted
	if c.IsGroup {
		for _, p := range c.Participants {
			if p.ID == msg.SenderID && p.IsMuted {
				return nil, fmt.Errorf("you are muted in this conversation")
			}
		}
	} else if c.OtherUser != nil {
		// For 1-on-1, check block status
		blocked, err := s.repo.IsBlockedEither(msg.SenderID, c.OtherUser.ID)
		if err != nil {
			return nil, err
		}
		if blocked {
			return nil, errBlocked
		}
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

	// Push to conversation subscribers
	s.hub.PropagateInboxConversation(msg.ConversationID, created, "message_created")

	// Also push a direct inbox notification to all participants
	for _, p := range c.Participants {
		if payload, err2 := json.Marshal(created); err2 == nil {
			notifMsg := &ws.Message{Type: ws.InboxMsg, Payload: payload}
			s.hub.SendToUser(p.ID, notifMsg)
		}
	}

	return created, nil
}

// DeleteMessage removes a message the caller sent.
func (s *Service) DeleteMessage(id, senderID int64) error {
	return s.repo.DeleteMessage(id, senderID)
}

// MarkRead marks all messages from the other user as read.
func (s *Service) MarkRead(conversationID, callerID int64) error {
	_, err := s.GetConversation(conversationID, callerID)
	if err != nil {
		return err
	}
	return s.repo.MarkConversationRead(conversationID, callerID)
}

// UnreadTotal returns the total unread message count across all conversations.
func (s *Service) UnreadTotal(userID int64) (int, error) {
	return s.repo.UnreadTotal(userID)
}

// DeleteConversation deletes a conversation and all its messages.
func (s *Service) DeleteConversation(conversationID, callerID int64) error {
	c, err := s.GetConversation(conversationID, callerID)
	if err != nil {
		return err
	}
	if c.IsGroup {
		// Only owner or manager can delete
		canDelete := false
		for _, p := range c.Participants {
			if p.ID == callerID && (p.Role == "owner" || p.Role == "manager") {
				canDelete = true
				break
			}
		}
		if !canDelete {
			return errForbidden
		}
	}
	return s.repo.DeleteConversation(conversationID)
}

func (s *Service) isManagerOrOwner(c *models.InboxConversation, userID int64) bool {
	if !c.IsGroup {
		return true // 1-on-1 doesn't have roles
	}
	for _, p := range c.Participants {
		if p.ID == userID && (p.Role == "owner" || p.Role == "manager") {
			return true
		}
	}
	return false
}

func (s *Service) LockConversation(conversationID, callerID int64, locked bool) error {
	c, err := s.GetConversation(conversationID, callerID)
	if err != nil {
		return err
	}
	if !s.isManagerOrOwner(c, callerID) {
		return errForbidden
	}
	err = s.repo.SetConversationLocked(conversationID, locked)
	if err == nil {
		s.hub.PropagateInboxConversation(conversationID, map[string]interface{}{
			"conversation_id": conversationID,
			"is_locked":       locked,
		}, "conversation_locked")
	}
	return err
}

func (s *Service) KickParticipant(conversationID, callerID, targetID int64) error {
	c, err := s.GetConversation(conversationID, callerID)
	if err != nil {
		return err
	}
	if callerID != targetID {
		if !s.isManagerOrOwner(c, callerID) {
			return errForbidden
		}
		// Check if target is owner
		for _, p := range c.Participants {
			if p.ID == targetID && p.Role == "owner" {
				return errForbidden // Cannot kick owner
			}
		}
	}
	err = s.repo.RemoveParticipant(conversationID, targetID)
	if err != nil {
		return err
	}

	var targetName string
	if targetUser, err := s.userSvc.GetByID(targetID); err == nil {
		targetName = targetUser.DisplayName
		if targetName == "" {
			targetName = targetUser.Username
		}
	} else {
		targetName = "A user"
	}

	var content string
	if callerID == targetID {
		content = fmt.Sprintf("%s left the group", targetName)
	} else {
		var callerName string
		if callerUser, err := s.userSvc.GetByID(callerID); err == nil {
			callerName = callerUser.DisplayName
			if callerName == "" {
				callerName = callerUser.Username
			}
		} else {
			callerName = "Someone"
		}
		content = fmt.Sprintf("%s removed %s from the group", callerName, targetName)
	}

	msg, _ := s.repo.CreateMessage(&models.InboxMessage{
		ConversationID: conversationID,
		SenderID:       callerID,
		Content:        content,
		MessageType:    "system_group_update",
	})
	if msg != nil {
		if u, err := s.userSvc.GetByID(callerID); err == nil {
			msg.SenderName = u.DisplayName
			msg.SenderAvatar = u.AvatarURL
		}
		s.hub.PropagateInboxConversation(conversationID, msg, "message_created")
	}

	s.hub.PropagateInboxConversation(conversationID, map[string]interface{}{
		"conversation_id": conversationID,
		"user_id":         targetID,
	}, "participant_removed")

	if payload, err2 := json.Marshal(map[string]interface{}{
		"action": "conversation_deleted",
		"data": map[string]interface{}{
			"id": conversationID,
		},
	}); err2 == nil {
		s.hub.SendToUser(targetID, &ws.Message{Type: ws.InboxUpdate, Payload: payload})
	}

	return nil
}

func (s *Service) AddParticipant(conversationID, callerID, targetID int64) error {
	c, err := s.GetConversation(conversationID, callerID)
	if err != nil {
		return err
	}
	if !c.IsGroup {
		return fmt.Errorf("cannot add participants to a 1-on-1 conversation")
	}
	if !s.isManagerOrOwner(c, callerID) {
		return errForbidden
	}

	for _, p := range c.Participants {
		if p.ID == targetID {
			return fmt.Errorf("user is already a participant")
		}
	}

	err = s.repo.AddParticipant(conversationID, targetID, "member")
	if err != nil {
		return err
	}

	var targetName string
	if targetUser, err := s.userSvc.GetByID(targetID); err == nil {
		targetName = targetUser.DisplayName
		if targetName == "" {
			targetName = targetUser.Username
		}
	} else {
		targetName = "A user"
	}

	var callerName string
	if callerUser, err := s.userSvc.GetByID(callerID); err == nil {
		callerName = callerUser.DisplayName
		if callerName == "" {
			callerName = callerUser.Username
		}
	} else {
		callerName = "Someone"
	}
	content := fmt.Sprintf("%s added %s to the group", callerName, targetName)

	msg, _ := s.repo.CreateMessage(&models.InboxMessage{
		ConversationID: conversationID,
		SenderID:       callerID,
		Content:        content,
		MessageType:    "system_group_update",
	})
	if msg != nil {
		if u, err := s.userSvc.GetByID(callerID); err == nil {
			msg.SenderName = u.DisplayName
			msg.SenderAvatar = u.AvatarURL
		}
		s.hub.PropagateInboxConversation(conversationID, msg, "message_created")
	}

	var p models.InboxParticipant
	if targetUser, err := s.userSvc.GetByID(targetID); err == nil {
		p.ID = targetUser.ID
		p.Username = targetUser.Username
		p.DisplayName = targetUser.DisplayName
		p.AvatarURL = targetUser.AvatarURL
	} else {
		p.ID = targetID
	}
	p.Role = "member"

	s.hub.PropagateInboxConversation(conversationID, map[string]interface{}{
		"conversation_id": conversationID,
		"participant":     p,
	}, "participant_added")

	cNew, _ := s.GetConversation(conversationID, targetID)
	if payload, err2 := json.Marshal(map[string]interface{}{
		"action": "conversation_created",
		"data":   cNew,
	}); err2 == nil {
		s.hub.SendToUser(targetID, &ws.Message{Type: ws.InboxUpdate, Payload: payload})
	}

	return nil
}

func (s *Service) MuteParticipant(conversationID, callerID, targetID int64, muted bool) error {
	c, err := s.GetConversation(conversationID, callerID)
	if err != nil {
		return err
	}
	if !s.isManagerOrOwner(c, callerID) {
		return errForbidden
	}
	for _, p := range c.Participants {
		if p.ID == targetID && p.Role == "owner" {
			return errForbidden // Cannot mute owner
		}
	}
	err = s.repo.SetParticipantMuted(conversationID, targetID, muted)
	if err == nil {
		s.hub.PropagateInboxConversation(conversationID, map[string]interface{}{
			"conversation_id": conversationID,
			"user_id":         targetID,
			"is_muted":        muted,
		}, "participant_muted")
	}
	return err
}

func (s *Service) ChangeParticipantRole(conversationID, callerID, targetID int64, newRole string) error {
	c, err := s.GetConversation(conversationID, callerID)
	if err != nil {
		return err
	}
	// Only owner can change roles
	isOwner := false
	for _, p := range c.Participants {
		if p.ID == callerID && p.Role == "owner" {
			isOwner = true
			break
		}
	}
	if !isOwner {
		return errForbidden
	}
	if newRole != "owner" && newRole != "manager" && newRole != "member" {
		return fmt.Errorf("invalid role")
	}
	err = s.repo.UpdateParticipantRole(conversationID, targetID, newRole)
	if err == nil {
		s.hub.PropagateInboxConversation(conversationID, map[string]interface{}{
			"conversation_id": conversationID,
			"user_id":         targetID,
			"role":            newRole,
		}, "participant_role_changed")
	}
	return err
}


func (s *Service) populateBlockState(c *models.InboxConversation, callerID int64) error {
	if c.IsGroup || c.OtherUser == nil {
		return nil
	}
	otherID := c.OtherUser.ID
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
