package ws

import "errors"

var ErrSubscriptionDenied = errors.New("websocket subscription denied")

// SubscriptionPolicy owns the resource-level authorization registry for
// client-created subscriptions. Callbacks are service-backed policy adapters;
// a missing callback or lookup failure denies access.
type SubscriptionPolicy struct {
	CanViewPage                 func(pageID, userID int64) error
	CanViewDocumentation        func(documentationID, userID int64) error
	CanViewDocumentationArticle func(articleID, userID int64) error
	CanJoinConversation         func(conversationID, userID int64) error
	CanViewOrder                func(orderID, userID int64) error
	CanViewProvisioning         func(instanceID, userID int64) error
	HasPermission               func(userID int64, permission string) (bool, error)
}

func (p SubscriptionPolicy) Authorize(client *Client, resourceType string, resourceID int64) error {
	if client == nil || resourceID < 0 {
		return ErrSubscriptionDenied
	}
	switch resourceType {
	case "forum_category", "thread", "store_product", "store_category":
		if resourceID > 0 {
			return nil
		}
	case "page":
		if resourceID > 0 && p.CanViewPage != nil && p.CanViewPage(resourceID, client.UserID) == nil {
			return nil
		}
	case "documentation":
		if resourceID > 0 && p.CanViewDocumentation != nil && p.CanViewDocumentation(resourceID, client.UserID) == nil {
			return nil
		}
	case "documentation_article":
		if resourceID > 0 && p.CanViewDocumentationArticle != nil && p.CanViewDocumentationArticle(resourceID, client.UserID) == nil {
			return nil
		}
	case "user", "inbox":
		if client.UserID > 0 && resourceID == client.UserID {
			return nil
		}
	case "inbox_conversation":
		if client.UserID > 0 && resourceID > 0 && p.CanJoinConversation != nil &&
			p.CanJoinConversation(resourceID, client.UserID) == nil {
			return nil
		}
	case "order":
		if client.UserID > 0 && resourceID > 0 && p.CanViewOrder != nil &&
			p.CanViewOrder(resourceID, client.UserID) == nil {
			return nil
		}
	case "log":
		if resourceID == 0 && p.hasPermission(client.UserID, "admin.general") {
			return nil
		}
	case "provisioning_logs":
		if client.UserID > 0 && resourceID > 0 {
			if p.hasPermission(client.UserID, "admin.general") {
				return nil
			}
			if p.CanViewProvisioning != nil && p.CanViewProvisioning(resourceID, client.UserID) == nil {
				return nil
			}
		}
	}
	return ErrSubscriptionDenied
}

func (p SubscriptionPolicy) hasPermission(userID int64, permission string) bool {
	if userID <= 0 || p.HasPermission == nil {
		return false
	}
	allowed, err := p.HasPermission(userID, permission)
	return err == nil && allowed
}
