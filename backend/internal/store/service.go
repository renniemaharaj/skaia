package store

import (
	"github.com/skaia/backend/models"
)

// Service coordinates repository access with caching for the store domain.
type Service struct {
	categories CategoryRepository
	products   ProductRepository
	cart       CartRepository
	orders     OrderRepository
	cache      *ProductCache
}

// NewService creates a Service.
func NewService(cats CategoryRepository, products ProductRepository, cart CartRepository, orders OrderRepository, cache *ProductCache) *Service {
	return &Service{
		categories: cats,
		products:   products,
		cart:       cart,
		orders:     orders,
		cache:      cache,
	}
}

// Category methods

func (s *Service) GetCategory(id int64) (*models.StoreCategory, error) {
	return s.categories.GetByID(id)
}

func (s *Service) ListCategories() ([]*models.StoreCategory, error) {
	return s.categories.List()
}

func (s *Service) CreateCategory(cat *models.StoreCategory) (*models.StoreCategory, error) {
	return s.categories.Create(cat)
}

func (s *Service) UpdateCategory(cat *models.StoreCategory) (*models.StoreCategory, error) {
	return s.categories.Update(cat)
}

func (s *Service) DeleteCategory(id int64) error {
	return s.categories.Delete(id)
}

// Product methods

func (s *Service) GetProduct(id int64) (*models.Product, error) {
	if p, ok := s.cache.GetByID(id); ok {
		return p, nil
	}
	p, err := s.products.GetByID(id)
	if err != nil {
		return nil, err
	}
	s.cache.SetByID(id, p)
	return p, nil
}

func (s *Service) ListProducts(limit, offset int) ([]*models.Product, error) {
	return s.products.List(limit, offset)
}

func (s *Service) ListProductsByCategory(categoryID int64, limit, offset int) ([]*models.Product, error) {
	return s.products.GetByCategory(categoryID, limit, offset)
}

func (s *Service) CreateProduct(p *models.Product) (*models.Product, error) {
	return s.products.Create(p)
}

func (s *Service) UpdateProduct(p *models.Product) (*models.Product, error) {
	updated, err := s.products.Update(p)
	if err == nil {
		s.cache.Invalidate(p.ID)
	}
	return updated, err
}

func (s *Service) DeleteProduct(id int64) error {
	err := s.products.Delete(id)
	if err == nil {
		s.cache.Invalidate(id)
	}
	return err
}

// Cart methods

func (s *Service) GetUserCart(userID int64) ([]*models.CartItem, error) {
	return s.cart.GetUserCart(userID)
}

func (s *Service) AddToCart(userID, productID int64, quantity int) (*models.CartItem, error) {
	return s.cart.AddToCart(userID, productID, quantity)
}

func (s *Service) UpdateCartItem(userID, productID int64, quantity int) (*models.CartItem, error) {
	return s.cart.UpdateItem(userID, productID, quantity)
}

func (s *Service) RemoveFromCart(userID, productID int64) error {
	return s.cart.RemoveFromCart(userID, productID)
}

func (s *Service) ClearCart(userID int64) error {
	return s.cart.ClearCart(userID)
}

// Order methods

func (s *Service) CreateOrder(order *models.Order, items []*models.OrderItem) (*models.Order, error) {
	return s.orders.Create(order, items)
}

func (s *Service) GetOrder(id int64) (*models.Order, error) {
	return s.orders.GetByID(id)
}

func (s *Service) GetUserOrders(userID int64, limit, offset int) ([]*models.Order, error) {
	return s.orders.GetByUser(userID, limit, offset)
}

func (s *Service) UpdateOrderStatus(id int64, status string) (*models.Order, error) {
	return s.orders.UpdateStatus(id, status)
}
