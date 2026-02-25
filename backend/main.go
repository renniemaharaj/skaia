package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"

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
	ForumPostRepo     repository.ForumPostRepository
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
		ForumPostRepo:     repository.NewForumPostRepository(database.DB),
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
	r.Get("/ws", func(w http.ResponseWriter, req *http.Request) {
		websocket.HandleConnection(w, req, appCtx.WebSocketHub)
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
		r.Get("/categories", handleForumCategories(appCtx))
		r.Get("/threads", handleForumThreadsList(appCtx))
		r.Post("/threads", handleForumThreadCreate(appCtx))
		r.Get("/threads/{id}", handleForumThreadGet(appCtx))
		r.Put("/threads/{id}", handleForumThreadUpdate(appCtx))
		r.Delete("/threads/{id}", handleForumThreadDelete(appCtx))
		r.Get("/threads/{id}/posts", handleForumPostsList(appCtx))
		r.Post("/threads/{id}/posts", handleForumPostCreate(appCtx))
		r.Put("/posts/{id}", handleForumPostUpdate(appCtx))
		r.Delete("/posts/{id}", handleForumPostDelete(appCtx))
	})

	// User endpoints
	r.Route("/users", func(r chi.Router) {
		r.Get("/{id}", handleGetUser(appCtx))
		r.Post("/", handleCreateUser(appCtx))
		r.Put("/{id}", handleUpdateUser(appCtx))
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

// Forum handlers
func handleForumCategories(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		categories, err := appCtx.ForumCategoryRepo.ListCategories()
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(categories)
	}
}

func handleForumThreadsList(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"threads": []interface{}{}})
	}
}

func handleForumThreadCreate(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(SimpleResponse{
			Message: "Forum thread created",
			Status:  "success",
		})
	}
}

func handleForumThreadGet(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}
}

func handleForumThreadUpdate(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SimpleResponse{
			Message: "Forum thread updated",
			Status:  "success",
		})
	}
}

func handleForumThreadDelete(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SimpleResponse{
			Message: "Forum thread deleted",
			Status:  "success",
		})
	}
}

func handleForumPostsList(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{"posts": []interface{}{}})
	}
}

func handleForumPostCreate(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(SimpleResponse{
			Message: "Forum post created",
			Status:  "success",
		})
	}
}

func handleForumPostUpdate(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SimpleResponse{
			Message: "Forum post updated",
			Status:  "success",
		})
	}
}

func handleForumPostDelete(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SimpleResponse{
			Message: "Forum post deleted",
			Status:  "success",
		})
	}
}

// User handlers
func handleGetUser(appCtx *AppContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
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
