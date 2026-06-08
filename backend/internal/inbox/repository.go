package inbox

import (
	"database/sql"
	"errors"

	"github.com/skaia/backend/models"
)

type sqlRepository struct{ db *sql.DB }

// NewRepository returns a Repository backed by db.
func NewRepository(db *sql.DB) Repository {
	return &sqlRepository{db: db}
}

// Conversations

func (r *sqlRepository) GetConversation(id int64) (*models.InboxConversation, error) {
	c := &models.InboxConversation{}
	var title sql.NullString
	err := r.db.QueryRow(
		`SELECT id, is_group, title, created_at, updated_at
		 FROM inbox_conversations WHERE id = $1`, id,
	).Scan(&c.ID, &c.IsGroup, &title, &c.CreatedAt, &c.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("conversation not found")
	}
	if title.Valid {
		c.Title = title.String
	}
	return c, err
}

func (r *sqlRepository) GetConversationBetween(user1ID, user2ID int64) (*models.InboxConversation, error) {
	c := &models.InboxConversation{}
	var title sql.NullString
	err := r.db.QueryRow(
		`SELECT c.id, c.is_group, c.title, c.created_at, c.updated_at
		 FROM inbox_conversations c
		 JOIN inbox_conversation_participants p1 ON p1.conversation_id = c.id
		 JOIN inbox_conversation_participants p2 ON p2.conversation_id = c.id
		 WHERE c.is_group = FALSE AND p1.user_id = $1 AND p2.user_id = $2`,
		user1ID, user2ID,
	).Scan(&c.ID, &c.IsGroup, &title, &c.CreatedAt, &c.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("conversation not found")
	}
	if title.Valid {
		c.Title = title.String
	}
	return c, err
}

func (r *sqlRepository) GetOrCreateConversation(user1ID, user2ID int64) (*models.InboxConversation, error) {
	c, err := r.GetConversationBetween(user1ID, user2ID)
	if err == nil {
		return c, nil
	}
	tx, err := r.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	c = &models.InboxConversation{}
	err = tx.QueryRow(
		`INSERT INTO inbox_conversations (is_group) VALUES (false) RETURNING id, is_group, created_at, updated_at`,
	).Scan(&c.ID, &c.IsGroup, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, err
	}
	_, err = tx.Exec(`INSERT INTO inbox_conversation_participants (conversation_id, user_id) VALUES ($1, $2), ($1, $3)`, c.ID, user1ID, user2ID)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return c, nil
}

func (r *sqlRepository) CreateGroupConversation(title string, participantIDs []int64) (*models.InboxConversation, error) {
	tx, err := r.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	c := &models.InboxConversation{}
	var t sql.NullString
	if title != "" {
		t.String = title
		t.Valid = true
	}
	err = tx.QueryRow(
		`INSERT INTO inbox_conversations (is_group, title) VALUES (true, $1) RETURNING id, is_group, title, created_at, updated_at`, t,
	).Scan(&c.ID, &c.IsGroup, &t, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if t.Valid {
		c.Title = t.String
	}
	for _, pid := range participantIDs {
		_, err = tx.Exec(`INSERT INTO inbox_conversation_participants (conversation_id, user_id) VALUES ($1, $2)`, c.ID, pid)
		if err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return c, nil
}

func (r *sqlRepository) ListConversations(userID int64) ([]*models.InboxConversation, error) {
	rows, err := r.db.Query(
		`SELECT c.id, c.is_group, c.title, c.created_at, c.updated_at
		 FROM inbox_conversations c
		 JOIN inbox_conversation_participants p ON p.conversation_id = c.id
		 WHERE p.user_id = $1
		 ORDER BY c.updated_at DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*models.InboxConversation
	for rows.Next() {
		c := &models.InboxConversation{}
		var title sql.NullString
		if err := rows.Scan(&c.ID, &c.IsGroup, &title, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		if title.Valid {
			c.Title = title.String
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *sqlRepository) GetParticipants(conversationID int64) ([]int64, error) {
	rows, err := r.db.Query(`SELECT user_id FROM inbox_conversation_participants WHERE conversation_id = $1`, conversationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}

// Messages

func (r *sqlRepository) GetMessage(id int64) (*models.InboxMessage, error) {
	m := &models.InboxMessage{}
	err := r.db.QueryRow(
		`SELECT id, conversation_id, sender_id, content, message_type,
		        COALESCE(attachment_url,''), COALESCE(attachment_name,''),
		        COALESCE(attachment_size,0), COALESCE(attachment_mime,''),
		        is_read, created_at, updated_at
		 FROM inbox_messages WHERE id = $1`, id,
	).Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.Content, &m.MessageType,
		&m.AttachmentURL, &m.AttachmentName, &m.AttachmentSize, &m.AttachmentMime,
		&m.IsRead, &m.CreatedAt, &m.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("message not found")
	}
	return m, err
}

func (r *sqlRepository) ListMessages(conversationID int64, limit, offset int) ([]*models.InboxMessage, error) {
	rows, err := r.db.Query(
		`SELECT id, conversation_id, sender_id, content, message_type,
		        COALESCE(attachment_url,''), COALESCE(attachment_name,''),
		        COALESCE(attachment_size,0), COALESCE(attachment_mime,''),
		        is_read, created_at, updated_at
		 FROM inbox_messages
		 WHERE conversation_id = $1
		 ORDER BY created_at DESC
		 LIMIT $2 OFFSET $3`,
		conversationID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*models.InboxMessage
	for rows.Next() {
		m := &models.InboxMessage{}
		if err := rows.Scan(&m.ID, &m.ConversationID, &m.SenderID, &m.Content, &m.MessageType,
			&m.AttachmentURL, &m.AttachmentName, &m.AttachmentSize, &m.AttachmentMime,
			&m.IsRead, &m.CreatedAt, &m.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (r *sqlRepository) CreateMessage(msg *models.InboxMessage) (*models.InboxMessage, error) {
	if msg.MessageType == "" {
		msg.MessageType = "text"
	}
	err := r.db.QueryRow(
		`INSERT INTO inbox_messages (conversation_id, sender_id, content, message_type, attachment_url, attachment_name, attachment_size, attachment_mime)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		 RETURNING id, conversation_id, sender_id, content, message_type,
		           COALESCE(attachment_url,''), COALESCE(attachment_name,''),
		           COALESCE(attachment_size,0), COALESCE(attachment_mime,''),
		           is_read, created_at, updated_at`,
		msg.ConversationID, msg.SenderID, msg.Content, msg.MessageType,
		nullIfEmpty(msg.AttachmentURL), nullIfEmpty(msg.AttachmentName),
		nullIfZero(msg.AttachmentSize), nullIfEmpty(msg.AttachmentMime),
	).Scan(&msg.ID, &msg.ConversationID, &msg.SenderID, &msg.Content, &msg.MessageType,
		&msg.AttachmentURL, &msg.AttachmentName, &msg.AttachmentSize, &msg.AttachmentMime,
		&msg.IsRead, &msg.CreatedAt, &msg.UpdatedAt)
	if err != nil {
		return nil, err
	}
	// Bump conversation updated_at so it surfaces at the top of the list.
	_, _ = r.db.Exec(
		`UPDATE inbox_conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
		msg.ConversationID,
	)
	return msg, nil
}

func nullIfEmpty(s string) interface{} {
	if s == "" {
		return nil
	}
	return s
}

func nullIfZero(n int64) interface{} {
	if n == 0 {
		return nil
	}
	return n
}

func (r *sqlRepository) DeleteMessage(id, senderID int64) error {
	res, err := r.db.Exec(
		`DELETE FROM inbox_messages WHERE id = $1 AND sender_id = $2`, id, senderID,
	)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return errors.New("message not found or not yours")
	}
	return nil
}

func (r *sqlRepository) MarkConversationRead(conversationID, userID int64) error {
	_, err := r.db.Exec(
		`UPDATE inbox_messages
		 SET is_read = TRUE
		 WHERE conversation_id = $1 AND sender_id != $2 AND is_read = FALSE`,
		conversationID, userID,
	)
	return err
}

func (r *sqlRepository) UnreadTotal(userID int64) (int, error) {
	var count int
	err := r.db.QueryRow(
		`SELECT COUNT(*)
		 FROM inbox_messages im
		 JOIN inbox_conversation_participants ic ON ic.conversation_id = im.conversation_id
		 WHERE ic.user_id = $1
		   AND im.sender_id != $1
		   AND im.is_read = FALSE`,
		userID,
	).Scan(&count)
	return count, err
}

func (r *sqlRepository) UnreadCount(conversationID, userID int64) (int, error) {
	var count int
	err := r.db.QueryRow(
		`SELECT COUNT(*)
		 FROM inbox_messages
		 WHERE conversation_id = $1
		   AND sender_id != $2
		   AND is_read = FALSE`,
		conversationID, userID,
	).Scan(&count)
	return count, err
}

func (r *sqlRepository) DeleteConversation(id int64) error {
	res, err := r.db.Exec(`DELETE FROM inbox_conversations WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return errors.New("conversation not found")
	}
	return nil
}

// Blocks

func (r *sqlRepository) BlockUser(blockerID, blockedID int64) error {
	_, err := r.db.Exec(
		`INSERT INTO user_blocks (blocker_id, blocked_id)
		 VALUES ($1, $2)
		 ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
		blockerID, blockedID,
	)
	return err
}

func (r *sqlRepository) UnblockUser(blockerID, blockedID int64) error {
	_, err := r.db.Exec(
		`DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2`,
		blockerID, blockedID,
	)
	return err
}

func (r *sqlRepository) IsBlocked(blockerID, blockedID int64) (bool, error) {
	var exists bool
	err := r.db.QueryRow(
		`SELECT EXISTS(SELECT 1 FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2)`,
		blockerID, blockedID,
	).Scan(&exists)
	return exists, err
}

func (r *sqlRepository) IsBlockedEither(userA, userB int64) (bool, error) {
	var exists bool
	err := r.db.QueryRow(
		`SELECT EXISTS(
			SELECT 1 FROM user_blocks
			WHERE (blocker_id = $1 AND blocked_id = $2)
			   OR (blocker_id = $2 AND blocked_id = $1)
		)`,
		userA, userB,
	).Scan(&exists)
	return exists, err
}

func (r *sqlRepository) ListBlockedUsers(blockerID int64) ([]int64, error) {
	rows, err := r.db.Query(
		`SELECT blocked_id FROM user_blocks WHERE blocker_id = $1 ORDER BY created_at DESC`,
		blockerID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
