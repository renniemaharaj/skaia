package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/skaia/backend/database"
	"github.com/skaia/backend/repository"
	"github.com/skaia/backend/websocket"
)

// SimpleResponse is a basic JSON response structure
type SimpleResponse struct {
	Message string `json:"message"`
	Status  string `json:"status"`
}

type AppContext struct {
	UserRepo          repository.UserRepository
	ProductRepo       repository.ProductRepository
	StoreCategoryRepo repository.StoreCategoryRepository
	CartRepo          repository.CartRepository
	OrderRepo         repository.OrderRepository
	ForumCategoryRepo repository.ForumCategoryRepository
	ForumThreadRepo   repository.ForumThreadRepository
	ThreadCommentRepo repository.ThreadCommentRepository
	WebSocketHub      *websocket.Hub
}

func main() {
	// Initialize database
	if err := database.Init(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	// Initialize repositories
	appCtx := &AppContext{
		UserRepo:          repository.NewUserRepository(database.DB),
		ProductRepo:       repository.NewProductRepository(database.DB),
		StoreCategoryRepo: repository.NewStoreCategoryRepository(database.DB),
		CartRepo:          repository.NewCartRepository(database.DB),
		OrderRepo:         repository.NewOrderRepository(database.DB),
		ForumCategoryRepo: repository.NewForumCategoryRepository(database.DB),
		ForumThreadRepo:   repository.NewForumThreadRepository(database.DB),
		ThreadCommentRepo: repository.NewThreadCommentRepository(database.DB),
		WebSocketHub:      websocket.NewHub(),
	}

	// Start WebSocket hub
	go appCtx.WebSocketHub.Run()

	// Create router
	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"*"},
		ExposedHeaders:   []string{"*"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SimpleResponse{
			Message: "Skaia API is healthy",
			Status:  "ok",
		})
	})

	// WebSocket route
	r.Get("/ws", WSHandler(appCtx))

	// Auth endpoints
	r.Route("/auth", func(r chi.Router) {
		r.Post("/register", handleRegister(appCtx))
		r.Post("/login", handleLogin(appCtx))
		r.Post("/refresh", handleRefreshToken(appCtx))
		r.With(JWTAuthMiddleware).Post("/logout", handleLogout(appCtx))
	})

	// Protected user endpoints
	r.Route("/users", func(r chi.Router) {
		r.Use(JWTAuthMiddleware)
		r.Get("/{id}", handleGetUser(appCtx))
		r.Get("/profile", handleGetProfile(appCtx))
		r.Post("/", handleCreateUser(appCtx))
		r.Put("/{id}", handleUpdateUser(appCtx))
		r.Get("/search", handleSearchUsers(appCtx))
		r.Post("/{id}/permissions", handleAddUserPermission(appCtx))
		r.Delete("/{id}/permissions/{perm}", handleRemoveUserPermission(appCtx))
	})

	// Permissions endpoints
	r.Route("/permissions", func(r chi.Router) {
		r.Use(JWTAuthMiddleware)
		r.Get("/", handleGetPermissions(appCtx))
	})

	// Store endpoints
	r.Route("/store", func(r chi.Router) {
		r.Get("/categories", handleStoreCategories(appCtx))
		r.Get("/categories/{id}", handleStoreCategoryGet(appCtx))
		r.Get("/products", handleStoreProducts(appCtx))
		r.Get("/products/{id}", handleStoreProductGet(appCtx))
		r.Post("/cart/add", handleAddToCart(appCtx))
		r.Get("/cart/{userId}", handleGetCart(appCtx))
		r.Post("/purchase", handlePurchase(appCtx))
	})

	// Forum endpoints
	r.Route("/forum", func(r chi.Router) {
		r.With(OptionalJWTAuthMiddleware).Get("/categories", handleForumCategories(appCtx))
		r.With(JWTAuthMiddleware).Post("/categories", handleForumCategoryCreate(appCtx))
		r.With(JWTAuthMiddleware).Delete("/categories/{id}", handleForumCategoryDelete(appCtx))
		r.Get("/threads", handleForumThreadsList(appCtx))
		r.With(JWTAuthMiddleware).Post("/threads", handleForumThreadCreate(appCtx))
		r.With(OptionalJWTAuthMiddleware).Get("/threads/{id}", handleForumThreadGet(appCtx))
		r.With(JWTAuthMiddleware).Put("/threads/{id}", handleForumThreadUpdate(appCtx))
		r.With(JWTAuthMiddleware).Delete("/threads/{id}", handleForumThreadDelete(appCtx))
		r.With(JWTAuthMiddleware).Post("/threads/{threadId}/like", handleForumThreadLike(appCtx))
		r.With(JWTAuthMiddleware).Delete("/threads/{threadId}/like", handleForumThreadUnlike(appCtx))
		r.With(OptionalJWTAuthMiddleware).Get("/threads/{id}/comments", handleThreadCommentsList(appCtx))
		r.With(JWTAuthMiddleware).Post("/threads/{id}/comments", handleThreadCommentCreate(appCtx))
		r.With(JWTAuthMiddleware).Put("/comments/{id}", handleThreadCommentUpdate(appCtx))
		r.With(JWTAuthMiddleware).Delete("/comments/{id}", handleThreadCommentDelete(appCtx))
		r.With(JWTAuthMiddleware).Post("/comments/{commentId}/like", handleThreadCommentLike(appCtx))
		r.With(JWTAuthMiddleware).Delete("/comments/{commentId}/like", handleThreadCommentUnlike(appCtx))
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Starting server on :%s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatal(err)
	}
}

// Store handlers
func handleStoreCategories(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		categories, err := appCtx.StoreCategoryRepo.ListCategories()
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(categories)
	}
}

func handleStoreCategoryGet(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Implementation for getting a specific category
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}
}

func handleStoreProducts(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		products, err := appCtx.ProductRepo.ListProducts(50, 0)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(products)
	}
}

func handleStoreProductGet(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}
}

func handleAddToCart(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(SimpleResponse{
			Message: "Item added to cart",
			Status:  "success",
		})
	}
}

func handleGetCart(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"items": []interface{}{}})
	}
}

func handlePurchase(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(SimpleResponse{
			Message: "Purchase completed",
			Status:  "success",
		})
	}
}

// User handlers
func handleGetUser(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		userID := chi.URLParam(r, "id")
		userIDInt, err := strconv.ParseInt(userID, 10, 64)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "invalid user id"})
			return
		}

		user, err := appCtx.UserRepo.GetUserByID(userIDInt)
		if err != nil {
			log.Printf("Error fetching user: %v", err)
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "user not found"})
			return
		}

		// Don't expose password hash
		user.PasswordHash = ""

		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(user)
	}
}

func handleCreateUser(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(SimpleResponse{
			Message: "User created",
			Status:  "success",
		})
	}
}

func handleUpdateUser(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SimpleResponse{
			Message: "User updated",
			Status:  "success",
		})
	}
}
