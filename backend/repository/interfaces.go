package repository

import (
	"github.com/skaia/backend/models"
)

// UserRepository defines operations for user data
type UserRepository interface {
	GetUserByID(id int64) (*models.User, error)
	GetUserByUsername(username string) (*models.User, error)
	GetUserByEmail(email string) (*models.User, error)
	CreateUser(user *models.User, passwordHash string) (*models.User, error)
	UpdateUser(user *models.User) (*models.User, error)
	DeleteUser(id int64) error
	ListUsers(limit int, offset int) ([]*models.User, error)
	SearchUsers(query string, limit int, offset int) ([]*models.User, error)
	AddRole(userID int64, roleID int64) error
	RemoveRole(userID int64, roleID int64) error
	HasPermission(userID int64, permission string) (bool, error)
	AddPermission(userID int64, permissionName string) error
	RemovePermission(userID int64, permissionName string) error
	GetAllPermissions() ([]*models.Permission, error)
}

// ProductRepository defines operations for product data
type ProductRepository interface {
	GetProductByID(id int64) (*models.Product, error)
	GetProductsByCategory(categoryID int64, limit int, offset int) ([]*models.Product, error)
	CreateProduct(product *models.Product) (*models.Product, error)
	UpdateProduct(product *models.Product) (*models.Product, error)
	DeleteProduct(id int64) error
	ListProducts(limit int, offset int) ([]*models.Product, error)
}

// CartRepository defines operations for cart data
type CartRepository interface {
	GetCartItem(userID, productID int64) (*models.CartItem, error)
	GetUserCart(userID int64) ([]*models.CartItem, error)
	AddToCart(userID, productID int64, quantity int) (*models.CartItem, error)
	UpdateCartItem(userID, productID int64, quantity int) (*models.CartItem, error)
	RemoveFromCart(userID, productID int64) error
	ClearCart(userID int64) error
}

// StoreCategoryRepository defines operations for store category data
type StoreCategoryRepository interface {
	GetCategoryByID(id int64) (*models.StoreCategory, error)
	GetCategoryByName(name string) (*models.StoreCategory, error)
	CreateCategory(category *models.StoreCategory) (*models.StoreCategory, error)
	UpdateCategory(category *models.StoreCategory) (*models.StoreCategory, error)
	DeleteCategory(id int64) error
	ListCategories() ([]*models.StoreCategory, error)
}

// OrderRepository defines operations for order data
type OrderRepository interface {
	CreateOrder(order *models.Order, items []*models.OrderItem) (*models.Order, error)
	GetOrderByID(id int64) (*models.Order, error)
	GetUserOrders(userID int64, limit int, offset int) ([]*models.Order, error)
	UpdateOrderStatus(id int64, status string) (*models.Order, error)
}

// ForumCategoryRepository defines operations for forum category data
type ForumCategoryRepository interface {
	GetCategoryByID(id int64) (*models.ForumCategory, error)
	GetCategoryByName(name string) (*models.ForumCategory, error)
	CreateCategory(category *models.ForumCategory) (*models.ForumCategory, error)
	UpdateCategory(category *models.ForumCategory) (*models.ForumCategory, error)
	DeleteCategory(id int64) error
	ListCategories() ([]*models.ForumCategory, error)
}

// ForumThreadRepository defines operations for forum thread data
type ForumThreadRepository interface {
	GetThreadByID(id int64) (*models.ForumThread, error)
	GetCategoryThreads(categoryID int64, limit int, offset int) ([]*models.ForumThread, error)
	CreateThread(thread *models.ForumThread) (*models.ForumThread, error)
	UpdateThread(thread *models.ForumThread) (*models.ForumThread, error)
	DeleteThread(id int64) error
	IncrementViewCount(id int64) error
	LikeThread(threadID int64, userID int64) (int64, error)
	UnlikeThread(threadID int64, userID int64) (int64, error)
	IsThreadLikedByUser(threadID int64, userID int64) (bool, error)
}

// ThreadCommentRepository defines operations for forum thread comment data
type ThreadCommentRepository interface {
	GetThreadCommentByID(id int64) (*models.ThreadComment, error)
	GetThreadComments(threadID int64, limit int, offset int) ([]*models.ThreadComment, error)
	CreateThreadComment(comment *models.ThreadComment) (*models.ThreadComment, error)
	UpdateThreadComment(comment *models.ThreadComment) (*models.ThreadComment, error)
	DeleteThreadComment(id int64) error
	LikeThreadComment(commentID int64, userID int64) (int64, error)
	UnlikeThreadComment(commentID int64, userID int64) (int64, error)
	IsThreadCommentLikedByUser(commentID int64, userID int64) (bool, error)
}
