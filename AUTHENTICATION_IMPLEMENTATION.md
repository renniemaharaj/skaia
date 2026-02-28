# JWT Authentication & Real-Time System Implementation Guide

## Overview

This document outlines the JWT-based authentication system with real-time WebSocket updates powered by Jotai atoms.

## Architecture

### Backend (Go)

#### 1. JWT Authentication (`auth/jwt.go`)

- **Token Generation**: Creates JWT tokens with user claims (id, username, email, roles, permissions)
- **Token Validation**: Validates incoming tokens and extracts claims
- **Token Refresh**: Issues new access tokens using refresh tokens
- **Duration**: Access tokens valid for 24 hours, refresh tokens for 7 days

#### 2. Password Security (`auth/password.go`)

- Uses bcrypt for password hashing
- Safe password comparison to prevent timing attacks

#### 3. Database Schema Updates

- **004_create_roles_and_permissions.sql**:
  - Creates roles table (admin, moderator, member, banned)
  - Creates permissions table with category support
  - Implements role-permission and user-permission associations
  - Seeded with default permissions like `forum.new-thread`, `forum.edit-thread`, etc.

- **005_update_users_table.sql**:
  - Adds: banner_url, photo_url, bio, discord_id
  - Adds: is_suspended, suspended_at, suspended_reason
  - Creates user_sessions table for session tracking

#### 4. Enhanced User Model

```go
type User struct {
  ID              uuid.UUID
  Username        string
  Email           string
  PasswordHash    string
  DisplayName     string
  AvatarURL       string
  BannerURL       string
  PhotoURL        string
  Bio             string
  DiscordID       *string
  IsSuspended     bool
  SuspendedAt     *time.Time
  SuspendedReason *string
  Roles           []string      // Loaded from DB
  Permissions     []string      // Loaded from DB
  CreatedAt       time.Time
  UpdatedAt       time.Time
}
```

#### 5. Middleware (`middleware.go`)

- **JWTAuthMiddleware**: Validates JWT tokens from Authorization header
- **PermissionMiddleware**: Checks user has required permission
- **OptionalJWTMiddleware**: Validates JWT if present but doesn't require it
- **AuthLimitMiddleware**: Rate limits auth endpoints (10 req/min)
- **RateLimitMiddleware**: General rate limiting (100 req/min)

#### 6. Auth Endpoints (`handlers_auth.go`)

- **POST /auth/register**: Creates new user with default member role
- **POST /auth/login**: Authenticates user, returns tokens
- **POST /auth/refresh**: Refreshes access token
- **GET /users/profile**: Returns authenticated user's profile

#### 7. Updated User Repository

- **GetByID/GetByEmail/GetByUsername**: Loads user with roles and permissions
- **Create**: Creates user and assigns default member role
- **Update**: Updates all user fields
- **AddRole/RemoveRole**: Manages user roles
- **HasPermission**: Checks if user has permission (direct or via role)

### Frontend (React + Jotai)

#### 1. Auth Atoms (`atoms/auth.ts`)

- **Token Management**: accessTokenAtom, refreshTokenAtom (persisted to localStorage)
- **User State**: currentUserAtom, isAuthenticatedAtom
- **UI State**: authLoadingAtom, authErrorAtom
- **Derived Atoms**: hasPermissionAtom, hasRoleAtom
- **Real-time**: socketAtom, socketConnectedAtom
- **Forum Data**: forumThreadsAtom, forumPostsAtom
- **Presence**: onlineUsersAtom
- **Update Queue**: uiUpdateQueueAtom (for batching updates)

#### 2. Auth Hooks (`hooks/useAuth.ts`)

- **useAuthState()**: Get full auth state
- **useAuth()**: Login, register, logout, refresh token
- **usePermission(permission)**: Check if user has permission
- **useRole(role)**: Check if user has role
- **useCurrentUser()**: Get current user
- **useIsAuthenticated()**: Get auth status
- **useAuthTokens()**: Get access/refresh tokens
- **useAuthenticatedFetch()**: HTTP client with auto token refresh

#### 3. WebSocket Hooks (`hooks/useWebSocket.ts`)

- **useWebSocket()**: Manages connection and real-time sync
  - Automatic reconnection on failure
  - 30-second heartbeat to keep connection alive
  - Message types: auth, sync, create, update, delete, presence, error
- **useRealtimeUpdate()**: Send real-time updates
  - createThread, updateThread, deleteThread
  - createPost, updatePost, deletePost

#### 4. File Upload Hooks (`hooks/useFileUpload.ts`)

- **uploadProfilePhoto()**: Upload avatar with progress tracking
- **uploadThreadBanner()**: Upload 350px height banner with progress tracking
- **validateImageFile()**: Validate file type and size
- **validateBannerDimensions()**: Ensure banner is 350px height

## Environment Variables

### Backend

```env
DATABASE_URL=postgres://user:pass@localhost:5432/skaia?sslmode=disable
JWT_SECRET=your-secret-key-change-in-production
PORT=8080
```

### Frontend

```env
VITE_API_BASE_URL=http://localhost:8080
VITE_WS_BASE_URL=ws://localhost:8080
```

## API Endpoints

### Authentication Routes (Rate Limited: 10 req/min)

- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user
- `POST /auth/refresh` - Refresh access token

### Protected Routes (Requires JWT)

- `GET /users/profile` - Get current profile
- `POST /users/upload-photo` - Upload profile photo
- `POST /users/upload-banner` - Upload thread banner
- `GET /users/{id}` - Get user profile (public)
- `POST /users/{id}/roles/{roleId}` - Add role (admin only)
- `DELETE /users/{id}/roles/{roleId}` - Remove role (admin only)
- `POST /users/{id}/permissions/{permId}` - Grant permission (admin only)

### Forum Routes (Protected)

- `POST /forum/threads` - Create thread (requires forum.new-thread)
- `PUT /forum/threads/{id}` - Edit thread (own or requires forum.edit-thread)
- `DELETE /forum/threads/{id}` - Delete thread (own or requires forum.delete-thread)
- `POST /forum/threads/{id}/posts` - Create post (requires forum.new-post)
- `PUT /forum/posts/{id}` - Edit post (own or requires forum.edit-post)
- `DELETE /forum/posts/{id}` - Delete post (own or requires forum.delete-post)

## WebSocket Message Format

### Client to Server

```json
{
  "type": "create|update|delete|sync",
  "entityType": "thread|post|user|permission",
  "data": {
    /* entity data */
  }
}
```

### Server to Client

```json
{
  "type": "create|update|delete|sync|presence|error|auth",
  "entityType": "thread|post|user|permission",
  "data": {
    /* entity data */
  },
  "errorMessage": "error description"
}
```

## Flow Examples

### Login Flow

1. User fills login form
2. `useAuth().login()` sends POST /auth/login
3. Server returns accessToken, refreshToken, user data
4. Tokens stored in localStorage via Jotai atoms
5. useAuthState returns authenticated state
6. WebSocket connects and authenticates with token
7. Components can use useCurrentUser() and usePermission()

### Creating a Forum Thread

1. User clicks "New Thread", fills form
2. Check `usePermission("forum.new-thread")`
3. If allowed, call `useRealtimeUpdate().createThread()`
4. WebSocket sends message to server
5. Server validates permission, creates thread in DB, broadcasts update via WebSocket
6. All connected clients receive "create" message
7. forumThreadsAtom updates via Jotai
8. Components re-render with new thread

### Token Refresh

1. API returns 401 Unauthorized
2. `useAuthenticatedFetch()` intercepts response
3. Calls `refreshAccessToken()` with refresh token
4. Server validates refresh token, returns new accessToken
5. Request automatically retried with new token
6. If refresh fails, user logged out

## Still To Implement

### Backend

- [ ] File upload endpoints (/users/upload-photo, /users/upload-banner)
- [ ] Discord OAuth integration (/auth/discord, /auth/discord/callback)
- [ ] User role management endpoints
- [ ] Permission management endpoints
- [ ] WebSocket authentication and message broadcasting
- [ ] Cache layer for frequently accessed data
- [ ] Rate limiting per user/IP
- [ ] Email verification
- [ ] Password reset flow

### Frontend

- [ ] Updated Auth component to use new hooks
- [ ] Login page with form
- [ ] Register page with form
- [ ] Discord OAuth button
- [ ] Profile edit page (with photo/banner upload)
- [ ] Permission-based component visibility
- [ ] Role badge display on threads
- [ ] Real-time notification system
- [ ] User suspension/ban handling

### Database/Schema

- [ ] Email verification table
- [ ] Password reset tokens
- [ ] File uploads table
- [ ] Audit log table
- [ ] User suspension details

## Next Steps

1. **Complete Backend File Upload**:
   - Implement `/users/upload-photo` endpoint
   - Implement `/users/upload-banner` endpoint
   - Use multipart form handling
   - Save files to cloud storage (S3/CloudFront)

2. **Discord OAuth**:
   - Register app at Discord Developer Portal
   - Implement OAuth flow endpoints
   - Sync Discord user data to Skaia user profile

3. **WebSocket Integration**:
   - Update WebSocket hub to handle authenticated connections
   - Implement message broadcasting by room (threads, DMs)
   - Cache active connections per user

4. **Update UI Components**:
   - Refactor Auth component to use new hooks
   - Add permission checks to edit/delete buttons
   - Display user roles and badges
   - Add upload UI for photos/banners

5. **Testing**:
   - Test JWT flow end-to-end
   - Test permission system
   - Test WebSocket connectivity
   - Load test with concurrent connections
