package events

import (
	"database/sql"
	"encoding/json"
	"log"
	"os"
	"strconv"
	"sync"
	"sync/atomic"
	"time"
)

// Activity constants for the event log.
const (
	// Auth
	ActUserRegistered = "user.registered"
	ActUserLoggedIn   = "user.logged_in"
	ActUserLoggedOut  = "user.logged_out"
	ActTokenRefreshed = "user.token_refreshed"

	// User management
	ActUserUpdated       = "user.updated"
	ActUserSuspended     = "user.suspended"
	ActUserUnsuspended   = "user.unsuspended"
	ActRoleAdded         = "user.role_added"
	ActRoleRemoved       = "user.role_removed"
	ActPermissionAdded   = "user.permission_added"
	ActPermissionRemoved = "user.permission_removed"
	ActPhotoUploaded     = "user.photo_uploaded"
	ActBannerUploaded    = "user.banner_uploaded"

	// Forum
	ActCategoryCreated = "forum.category_created"
	ActCategoryUpdated = "forum.category_updated"
	ActCategoryDeleted = "forum.category_deleted"
	ActThreadCreated   = "forum.thread_created"
	ActThreadUpdated   = "forum.thread_updated"
	ActThreadDeleted   = "forum.thread_deleted"
	ActThreadLocked    = "forum.thread_locked"
	ActThreadShared    = "forum.thread_shared"
	ActThreadLiked     = "forum.thread_liked"
	ActThreadUnliked   = "forum.thread_unliked"
	ActCommentCreated  = "forum.comment_created"
	ActCommentUpdated  = "forum.comment_updated"
	ActCommentDeleted  = "forum.comment_deleted"
	ActCommentLiked    = "forum.comment_liked"
	ActCommentUnliked  = "forum.comment_unliked"

	// Store
	ActStoreCategoryCreated  = "store.category_created"
	ActStoreCategoryUpdated  = "store.category_updated"
	ActStoreCategoryDeleted  = "store.category_deleted"
	ActProductCreated        = "store.product_created"
	ActProductUpdated        = "store.product_updated"
	ActProductDeleted        = "store.product_deleted"
	ActCartItemAdded         = "store.cart_item_added"
	ActCartItemUpdated       = "store.cart_item_updated"
	ActCartItemRemoved       = "store.cart_item_removed"
	ActCartCleared           = "store.cart_cleared"
	ActCheckout              = "store.checkout"
	ActOrderStatusUpdated    = "store.order_status_updated"
	ActOrderCreated          = "store.order_created"
	ActSubscriptionCreated   = "store.subscription_created"
	ActSubscriptionCancelled = "store.subscription_cancelled"
	ActPlanCreated           = "store.plan_created"
	ActPlanUpdated           = "store.plan_updated"
	ActPlanDeleted           = "store.plan_deleted"

	// Pages
	ActPageCreated        = "page.created"
	ActPageUpdated        = "page.updated"
	ActPageDeleted        = "page.deleted"
	ActPageLiked          = "page.liked"
	ActPageUnliked        = "page.unliked"
	ActPageCommentCreated = "page.comment_created"
	ActPageCommentUpdated = "page.comment_updated"
	ActPageCommentDeleted = "page.comment_deleted"

	// Config / Landing
	ActBrandingUpdated = "config.branding_updated"
	ActSEOUpdated      = "config.seo_updated"
	ActFooterUpdated   = "config.footer_updated"
	ActSectionCreated  = "config.section_created"
	ActSectionUpdated  = "config.section_updated"
	ActSectionDeleted  = "config.section_deleted"

	// Inbox
	ActMessageSent    = "inbox.message_sent"
	ActMessageDeleted = "inbox.message_deleted"
	ActUserBlocked    = "inbox.user_blocked"
	ActUserUnblocked  = "inbox.user_unblocked"

	// Uploads
	ActFileUploaded = "upload.file_uploaded"

	// System
	ActBackendArmed    = "system.armed"
	ActBackendDisarmed = "system.disarmed"
)

// Resource type constants.
const (
	ResUser          = "user"
	ResForum         = "forum_thread"
	ResForumComment  = "forum_comment"
	ResForumCategory = "forum_category"
	ResStoreCategory = "store_category"
	ResProduct       = "product"
	ResOrder         = "order"
	ResPlan          = "subscription_plan"
	ResSubscription  = "subscription"
	ResPage          = "page"
	ResPageComment   = "page_comment"
	ResConversation  = "conversation"
	ResMessage       = "inbox_message"
	ResConfig        = "config"
	ResUpload        = "upload"
)

// Job represents a unit of work on the conveyor belt.
// Every job is automatically logged as an event after its Fn (if any) executes.
type Job struct {
	UserID     int64
	Activity   string
	Resource   string
	ResourceID int64
	Meta       map[string]interface{}
	IP         string
	Fn         func() // optional side-effect to execute within the worker
}

// Dispatcher manages the job conveyor belt with buffered channels and a worker pool.
type Dispatcher struct {
	jobs      chan Job
	repo      *Repository
	workers   int
	wg        sync.WaitGroup
	done      atomic.Bool
	OnPersist func(event map[string]interface{}) // optional callback after an event is persisted
}

func envIntDefault(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		return def
	}
	return n
}

// NewDispatcher creates a Dispatcher with a buffered job channel and worker pool.
// Tunable via EVENTS_WORKERS (default 4) and EVENTS_BUFFER (default 4096).
func NewDispatcher(db *sql.DB) *Dispatcher {
	workers := envIntDefault("EVENTS_WORKERS", 4)
	bufSize := envIntDefault("EVENTS_BUFFER", 4096)
	return &Dispatcher{
		jobs:    make(chan Job, bufSize),
		repo:    NewRepository(db),
		workers: workers,
	}
}

// Start launches the worker pool goroutines.
func (d *Dispatcher) Start() {
	for i := 0; i < d.workers; i++ {
		d.wg.Add(1)
		go d.worker(i)
	}
	log.Printf("events: dispatcher started — workers=%d buffer=%d", d.workers, cap(d.jobs))
}

// Stop signals workers to drain remaining jobs and exit.
// Call after the HTTP server has stopped accepting new requests.
func (d *Dispatcher) Stop() {
	d.done.Store(true)
	close(d.jobs)
	d.wg.Wait()
	log.Println("events: dispatcher stopped")
}

// Dispatch pushes a job onto the conveyor belt. Non-blocking: if the buffer is
// full the job is dropped with a log warning (back-pressure safety valve).
func (d *Dispatcher) Dispatch(job Job) {
	if d.done.Load() {
		return
	}
	select {
	case d.jobs <- job:
	default:
		log.Printf("events: buffer full, dropping %s for user %d", job.Activity, job.UserID)
	}
}

// worker processes jobs from the conveyor belt until the channel is closed.
func (d *Dispatcher) worker(id int) {
	defer d.wg.Done()
	for job := range d.jobs {
		d.processJob(job)
	}
}

// processJob executes the optional side-effect, then persists the event log.
func (d *Dispatcher) processJob(job Job) {
	// Execute optional side-effect (broadcasts, notifications, etc.)
	if job.Fn != nil {
		func() {
			defer func() {
				if r := recover(); r != nil {
					log.Printf("events: panic in job %s: %v", job.Activity, r)
				}
			}()
			job.Fn()
		}()
	}

	// Persist the event
	meta := "{}"
	if len(job.Meta) > 0 {
		if b, err := json.Marshal(job.Meta); err == nil {
			meta = string(b)
		}
	}

	var userID *int64
	if job.UserID > 0 {
		userID = &job.UserID
	}
	var resourceID *int64
	if job.ResourceID > 0 {
		resourceID = &job.ResourceID
	}

	if d.repo != nil && d.repo.db != nil {
		if err := d.repo.Insert(userID, job.Activity, job.Resource, resourceID, meta, job.IP); err != nil {
			log.Printf("events: failed to persist %s: %v", job.Activity, err)
		} else if d.OnPersist != nil {
			evt := map[string]interface{}{
				"activity":   job.Activity,
				"resource":   job.Resource,
				"meta":       json.RawMessage(meta),
				"created_at": time.Now().UTC().Format(time.RFC3339),
			}
			if userID != nil {
				evt["user_id"] = *userID
			}
			if resourceID != nil {
				evt["resource_id"] = *resourceID
			}
			d.OnPersist(evt)
		}
	}
}
