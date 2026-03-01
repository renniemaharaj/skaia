# Subscription-Based Event Propagation Architecture

## Overview

This document describes the **subscription-based event propagation model** that replaces the previous polling/broadcasting approach. The backend now tracks which resources each connected WebSocket client has viewed, and proactively pushes changes only to clients that care about those resources.

### Core Principle

**The backend owns the responsibility of change propagation.**

- When you request a resource (via REST API), the backend implicitly tracks that you're interested in updates for that resource
- When that resource changes, the backend pushes updates only to clients who've viewed it
- The frontend doesn't need to know about subscriptions—it just listens and updates local state
- Cache invalidation is automatic: when the backend propagates a change, that's the signal to update

---

## Architecture Layers

### 1. Backend WebSocket Hub (Go)

**File:** `backend/websocket/hub.go`

#### New Structures

```go
// Tracks client interest in specific resources
type ResourceSubscription struct {
    Client       *Client // The connected client
    ResourceType string  // "user", "forum_category"
    ResourceID   int64   // The specific resource ID
}

// Enhanced Hub with subscription tracking
type Hub struct {
    clients        map[*Client]bool
    subscriptions  map[string][]*Client  // key: "resource_type:resource_id"
    subscribe      chan ResourceSubscription
    unsubscribe    chan ResourceSubscription
    // ... existing channels
}
```

#### New Methods

1. **`Subscribe(client, resourceType, resourceID)`**
   - Registers a client's interest in a specific resource
   - Called when client sends WebSocket `subscribe` message

2. **`Unsubscribe(client, resourceType, resourceID)`**
   - Removes a client's subscription when they leave a page
   - Called when client sends WebSocket `unsubscribe` message

3. **`PropagateUser(userID, userData)`**
   - Sends user updates only to clients that have viewed that user
   - Called from handlers when user data changes

4. **`PropagateForumCategories(categoryID, data, action)`**
   - Sends forum category updates to subscribed clients
   - Actions: `category_created`, `category_deleted`, `category_updated`

5. **`PropagateToAll(resourceType, data, action)`**
   - Sends updates to ALL clients subscribed to any resource of a type
   - Used when creating new resources (all forum-watchers should see new categories)

---

### 2. Frontend WebSocket Hook (TypeScript/React)

**File:** `skaia/src/hooks/useWebSocketSync.ts`

#### New Hook Functions

```typescript
// Returns subscription management functions
const { subscribe, unsubscribe } = useWebSocketSync();

// Register interest in a resource
subscribe("forum_category", categoryId); // Now receives updates for that category

// Unregister interest (when leaving a page)
unsubscribe("forum_category", categoryId);
```

#### Message Handling

The hook listens for backend-propagated updates:

- **`user:update`** - User data changed
- **`forum:update`** - Forum category changed

Updates automatically synchronize with Jotai atoms, so all components using those atoms see the change instantly.

---

### 3. Frontend Component Integration

**File:** `skaia/src/components/Forum.tsx`

When components fetch resources, they should register subscriptions:

```typescript
useEffect(() => {
  const loadForums = async () => {
    const categories = await apiRequest("/forum/categories");
    setForumCategories(categories);

    // Register subscriptions so we receive propagated updates
    categories.forEach((category) => {
      subscribe("forum_category", category.id);
    });
  };

  loadForums();
}, [subscribe]);
```

---

## Message Flow

### Scenario 1: User Deletes a Forum Category

```
┌─────────────────────────────────────────────────────────┐
│ Client A (User with moderate permissions)               │
│ Frontend: handleDeleteCategory(categoryId)              │
│ → DELETE /api/forum/categories/{id}                     │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│ Backend Handler: handleForumCategoryDelete              │
│ ✓ Validates permissions                                 │
│ ✓ Deletes from database                                │
│ ✓ Calls appCtx.WebSocketHub.PropagateForumCategories   │
│   (seeks clients subscribed to "forum_category:{id}")   │
└─────────────────────────────────────────────────────────┘
                           ↓
         Propagation to Subscribed Clients:

         Client A  Client B  Client C (desktop)  Client D
         (Mobile)  (Tablet)                      (no subscribe)
            ↓        ↓             ↓                   ✗
        Receives  Receives      Receives          Does NOT
        forum:    forum:        forum:             receive
        update    update        update
            ↓        ↓             ↓
        Updates   Updates       Updates
        atom      atom          atom
            ↓        ↓             ↓
        All UI   All UI        All UI
        updates  updates       updates
        instantly instantly     instantly
```

### Scenario 2: User Views a User Profile

```
Client sends: GET /api/users/{id}
Backend returns user data
(Implicitly, Backend now tracks: "Client A viewed user:123")

Later, user data changes elsewhere:
Backend calls: propagateUser(123, updatedUserData)
→ Finds all clients subscribed to "user:123"
→ Sends user:update to each
→ Clients update their atoms
→ UI reflects changes in real-time
```

---

## Request/Response Examples

### Subscribe Message (Client → Server)

```json
{
  "type": "subscribe",
  "payload": {
    "resource_type": "forum_category",
    "resource_id": 42
  }
}
```

### Unsubscribe Message (Client → Server)

```json
{
  "type": "unsubscribe",
  "payload": {
    "resource_type": "forum_category",
    "resource_id": 42
  }
}
```

### Propagation Message (Server → Client)

```json
{
  "type": "forum:update",
  "payload": {
    "action": "category_deleted",
    "id": 42,
    "data": null
  }
}
```

---

## Benefits of This Architecture

1. **Simplicity**: Backend controls everything; frontend just subscribes and listens
2. **Efficiency**: Only sends updates to clients that care (no broadcast waste)
3. **Correctness**: No race conditions between REST operations and WebSocket messages
4. **Scalability**: Easy to extend to new resources: just add handlers and propagation calls
5. **No Polling**: True event-driven updates (fire-and-forget, not continuous polling)
6. **Stateless Frontend**: Components don't manage subscription state; hook handles it
7. **Atomic Updates**: Jotai atoms ensure consistency across all components using that resource

---

## Implementation Checklist

- [x] **Hub subscription tracking** - Tracks which clients care about which resources
- [x] **Propagation functions** - PropagateUser, PropagateForumCategories, PropagateToAll
- [x] **WebSocket message parsing** - Handle subscribe/unsubscribe from clients
- [x] **Frontend hook functions** - subscribe() and unsubscribe() exported from useWebSocketSync
- [x] **Message routing** - Backend Routes forum delete to propagate instead of broadcast
- [x] **Component integration** - Forum component calls subscribe when loading categories
- [x] **Atom synchronization** - Hook updates atoms when propagation messages arrive
- [ ] **User propagation integration** - Update user handlers to use PropagateUser
- [ ] **Permission changes propagation** - When permissions change, propagate to that user
- [ ] **Cleanup on departure** - Automatically unsubscribe when components unmount

---

## Future Enhancements

1. **Autounsubscribe on unmount**: Have useWebSocketSync hook return cleanup function
2. **Batch subscriptions**: Send multiple subscriptions in one message
3. **Subscription health**: Monitor and clean up dead subscriptions
4. **Cache versioning**: Track resource versions to avoid processing stale updates
5. **Conflict resolution**: If client has newer version, ignore server update
6. **Offline support**: Queue updates while offline, replay on reconnect

---

## Debugging

Enable console logging in `useWebSocketSync.ts` to see:

- `Subscribed to forum_category:123`
- `Received forum propagation: category_deleted for category 123`
- `WebSocket connected for change propagation`

Check backend logs for:

- `Client subscribed to forum_category:123`
- `Failed to send forum propagation to client UserID=456`

---

## Database Considerations

The subscription model works with any database:

- **SQL (PostgreSQL)**: Natural fit for tracking relationships
- **NoSQL**: Can store subscriptions in Redis for fast lookups
- **In-Memory**: Hub's map is in-memory per server (ideal for single-server setups)

For multi-server deployments, consider Redis pub/sub to propagate across servers.
