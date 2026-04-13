package ws

import (
	"encoding/json"
	"log"
)

// PropagateUser sends updated user data to all clients subscribed to that user.
func (h *Hub) PropagateUser(userID int64, userData interface{}) {
	h.propagate("user", userID, UserUpdate, "user_updated", userData)
}

// PropagateForumCategories sends forum category data to subscribed clients.
func (h *Hub) PropagateForumCategories(categoryID int64, data interface{}, action string) {
	h.propagate("forum_category", categoryID, ForumUpdate, action, data)
}

// PropagateForumThread sends forum thread data to subscribed clients.
func (h *Hub) PropagateForumThread(threadID int64, data interface{}, action string) {
	h.propagate("thread", threadID, ForumUpdate, action, data)
}

// PropagateInboxConversation sends an inbox message event to all clients subscribed to a conversation.
func (h *Hub) PropagateInboxConversation(conversationID int64, data interface{}, action string) {
	h.propagate("inbox_conversation", conversationID, InboxUpdate, action, data)
}

// PropagateStoreProduct sends a store product event to all clients subscribed to that product.
func (h *Hub) PropagateStoreProduct(productID int64, data interface{}, action string) {
	h.propagate("store_product", productID, StoreUpdate, action, data)
}

// PropagateStoreCategory sends a store category event to all clients subscribed to that category.
func (h *Hub) PropagateStoreCategory(categoryID int64, data interface{}, action string) {
	h.propagate("store_category", categoryID, StoreUpdate, action, data)
}

// BroadcastStoreCatalog broadcasts a store catalog change to every connected client.
// Used for events that all clients should react to (e.g. product created/deleted).
func (h *Hub) BroadcastStoreCatalog(data interface{}, action string) {
	payload, _ := json.Marshal(map[string]interface{}{
		"action": action,
		"data":   data,
	})
	msg := &Message{Type: StoreUpdate, Payload: payload}
	h.Broadcast(msg)
}

// PushCartUpdate sends the current cart item list to every connection owned by userID.
func (h *Hub) PushCartUpdate(userID int64, items interface{}) {
	payload, _ := json.Marshal(map[string]interface{}{
		"action": "cart_updated",
		"data":   items,
	})
	h.SendToUser(userID, &Message{Type: CartUpdate, Payload: payload})
}

// BroadcastConfig sends a site-configuration change to every connected client.
func (h *Hub) BroadcastConfig(action string, data interface{}) {
	payload, _ := json.Marshal(map[string]interface{}{
		"action": action,
		"data":   data,
	})
	h.Broadcast(&Message{Type: ConfigUpdate, Payload: payload})
}

// BroadcastPage sends a CMS page change to every connected client.
func (h *Hub) BroadcastPage(action string, data interface{}) {
	payload, _ := json.Marshal(map[string]interface{}{
		"action": action,
		"data":   data,
	})
	h.Broadcast(&Message{Type: PageUpdate, Payload: payload})
}

// PushNotificationRead notifies the user's connections that a notification has been
// read or deleted. Use notifID=0 for bulk actions (mark-all-read, delete-all).
func (h *Hub) PushNotificationRead(userID int64, action string, notifID int64) {
	payload, _ := json.Marshal(map[string]interface{}{
		"action": action,
		"id":     notifID,
	})
	h.SendToUser(userID, &Message{Type: NotificationUpdate, Payload: payload})
}

// PropagateToAll sends a message to every client subscribed to any key that
// starts with resourceType (e.g. "store" matches "store:1", "store:2").
func (h *Hub) PropagateToAll(resourceType string, data interface{}, action string) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	payload, _ := json.Marshal(map[string]interface{}{
		"action": action,
		"data":   data,
	})
	msg := &Message{
		Type:    MessageType(resourceType + ":update"),
		Payload: payload,
	}

	prefix := resourceType + ":"
	for key, clients := range h.subscriptions {
		if len(key) <= len(prefix) || key[:len(prefix)] != prefix {
			continue
		}
		for _, client := range clients {
			select {
			case client.Send <- msg:
			default:
				log.Printf("ws: send buffer full, dropping message for userID=%d", client.UserID)
			}
		}
	}
}

// propagate is the shared implementation used by all Propagate* helpers.
func (h *Hub) propagate(resourceType string, resourceID int64, msgType MessageType, action string, data interface{}) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	key := subscriptionKey(resourceType, resourceID)
	clients, exists := h.subscriptions[key]
	if !exists {
		return
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"action": action,
		"id":     resourceID,
		"data":   data,
	})
	msg := &Message{Type: msgType, Payload: payload}

	for _, client := range clients {
		select {
		case client.Send <- msg:
		default:
			log.Printf("ws: send buffer full, dropping message for userID=%d", client.UserID)
		}
	}
}
