package store

import (
	"context"

	"github.com/skaia/backend/database"
	"github.com/skaia/backend/models"
)

type sqlReviewRepository struct{ db database.Executor }

func NewReviewRepository(db database.Executor) ReviewRepository {
	return &sqlReviewRepository{db: db}
}

func (r *sqlReviewRepository) GetProductReviews(ctx context.Context, productID int64) ([]*models.ProductReviewWithUser, error) {
	query := `
		SELECT 
			pr.id, pr.product_id, pr.user_id, pr.rating, pr.comment, pr.created_at, pr.updated_at,
			u.display_name, u.avatar_url, u.username
		FROM product_reviews pr
		JOIN users u ON u.id = pr.user_id
		WHERE pr.product_id = $1
		ORDER BY pr.created_at DESC
	`
	rows, err := r.db.QueryContext(ctx, query, productID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reviews []*models.ProductReviewWithUser
	for rows.Next() {
		var rev models.ProductReviewWithUser
		rev.User = &models.UserSummary{}
		err := rows.Scan(
			&rev.ID, &rev.ProductID, &rev.UserID, &rev.Rating, &rev.Comment, &rev.CreatedAt, &rev.UpdatedAt,
			&rev.User.DisplayName, &rev.User.AvatarURL, &rev.User.DisplayName,
		)
		if err != nil {
			return nil, err
		}
		rev.User.ID = rev.UserID // Populate ID
		reviews = append(reviews, &rev)
	}
	return reviews, rows.Err()
}

func (r *sqlReviewRepository) CreateProductReview(ctx context.Context, review *models.ProductReview) error {
	query := `
		INSERT INTO product_reviews (product_id, user_id, rating, comment)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (product_id, user_id) 
		DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = CURRENT_TIMESTAMP
		RETURNING id, created_at, updated_at
	`
	return r.db.QueryRowContext(ctx, query, review.ProductID, review.UserID, review.Rating, review.Comment).
		Scan(&review.ID, &review.CreatedAt, &review.UpdatedAt)
}
