package repository

import (
	"github.com/google/uuid"
	"github.com/skaia/backend/models"
)

// UserRepository defines operations for user data
type UserRepository interface {
	GetUserByID(id uuid.UUID) (*models.User, error)
	GetUserByUsername(username string) (*models.User, error)
	GetUserByEmail(email string) (*models.User, error)
	CreateUser(user *models.User, passwordHash string) (*models.User, error)
	UpdateUser(user *models.User) (*models.User, error)
	DeleteUser(id uuid.UUID) error
	ListUsers(limit int, offset int) ([]*models.User, error)
}

// ProductRepository defines operations for product data
type ProductRepository interface {
	GetProductByID(id uuid.UUID) (*models.Product, error)
	GetProductsByCategory(categoryID uuid.UUID, limit int, offset int) ([]*models.Product, error)
	CreateProduct(product *models.Product) (*models.Product, error)
	UpdateProduct(product *models.Product) (*models.Product, error)
	DeleteProduct(id uuid.UUID) error
	ListProducts(limit int, offset int) ([]*models.Product, error)
}

// StoreCategoryRepository defines operations for store category data
type StoreCategoryRepository interface {
	GetCategoryByID(id uuid.UUID) (*models.StoreCategory, error)
	GetCategoryByName(name string) (*models.StoreCategory, error)
	CreateCategory(category *models.StoreCategory) (*models.StoreCategory, error)
	UpdateCategory(category *models.StoreCategory) (*models.StoreCategory, error)
	DeleteCategory(id uuid.UUID) error
	ListCategories() ([]*models.StoreCategory, error)
}

// CartRepository defines operations for cart data
type CartRepository interface {
	GetCartItem(userID, productID uuid.UUID) (*models.CartItem, error)
	GetUserCart(userID uuid.UUID) ([]*models.CartItem, error)
	AddToCart(userID, productID uuid.UUID, quantity int) (*models.CartItem, error)
	UpdateCartItem(userID, productID uuid.UUID, quantity int) (*models.CartItem, error)
	RemoveFromCart(userID, productID uuid.UUID) error
	ClearCart(userID uuid.UUID) error
}

// OrderRepository defines operations for order data
type OrderRepository interface {
	CreateOrder(order *models.Order, items []*models.OrderItem) (*models.Order, error)
	GetOrderByID(id uuid.UUID) (*models.Order, error)
	GetUserOrders(userID uuid.UUID, limit int, offset int) ([]*models.Order, error)
	UpdateOrderStatus(id uuid.UUID, status string) (*models.Order, error)
}

// ForumCategoryRepository defines operations for forum category data
type ForumCategoryRepository interface {
	GetCategoryByID(id uuid.UUID) (*models.ForumCategory, error)
	GetCategoryByName(name string) (*models.ForumCategory, error)
	CreateCategory(category *models.ForumCategory) (*models.ForumCategory, error)
	UpdateCategory(category *models.ForumCategory) (*models.ForumCategory, error)
	DeleteCategory(id uuid.UUID) error
	ListCategories() ([]*models.ForumCategory, error)
}

// ForumThreadRepository defines operations for forum thread data
type ForumThreadRepository interface {
	GetThreadByID(id uuid.UUID) (*models.ForumThread, error)
	GetCategoryThreads(categoryID uuid.UUID, limit int, offset int) ([]*models.ForumThread, error)
	CreateThread(thread *models.ForumThread) (*models.ForumThread, error)
	UpdateThread(thread *models.ForumThread) (*models.ForumThread, error)
	DeleteThread(id uuid.UUID) error
	IncrementViewCount(id uuid.UUID) error
}

// ForumPostRepository defines operations for forum post data
type ForumPostRepository interface {
	GetPostByID(id uuid.UUID) (*models.ForumPost, error)
	GetThreadPosts(threadID uuid.UUID, limit int, offset int) ([]*models.ForumPost, error)
	CreatePost(post *models.ForumPost) (*models.ForumPost, error)
	UpdatePost(post *models.ForumPost) (*models.ForumPost, error)
	DeletePost(id uuid.UUID) error
}
