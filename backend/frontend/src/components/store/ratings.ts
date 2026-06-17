// hooks/ratings.ts

import { useEffect, useMemo, useState, useCallback } from "react";
import { apiRequest } from "../../utils/api";

export interface ProductReview {
  id: string | number;
  author_id?: string | number | null;
  author_name?: string | null;
  author_avatar?: string | null;
  author_username?: string | null;
  content: string;
  created_at: string;
  rating?: number;
  can_delete?: boolean;
}

export function useProductRatings(productId?: string | number) {
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [loading, setLoading] = useState(true);

  const loadReviews = useCallback(async () => {
    if (!productId) return;

    setLoading(true);

    try {
      const data = await apiRequest<any[]>(`/store/products/${productId}/reviews`);

      setReviews(
        (data || []).map(r => ({
          id: r.id,
          author_id: r.user?.id || r.user_id,
          author_name: r.user?.display_name,
          author_avatar: r.user?.avatar_url,
          author_username: r.user?.username,
          content: r.comment,
          created_at: r.created_at,
          rating: r.rating,
          can_delete: r.can_delete,
        }))
      );
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return 0;

    const total = reviews.reduce((sum, review) => sum + (review.rating || 0), 0);

    return total / reviews.length;
  }, [reviews]);

  return {
    reviews,
    loading,
    averageRating,
    reviewCount: reviews.length,
    reload: loadReviews,
  };
}
