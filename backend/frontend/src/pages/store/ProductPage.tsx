import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import {
  productsAtom,
  storeCartItemsAtom,
  type Product,
} from "../../atoms/store";
import { isAuthenticatedAtom, currentUserAtom } from "../../atoms/auth";
import { apiRequest } from "../../utils/api";
import CommentSection from "../../components/comments/CommentSection";
import StarRating from "../../components/ui/StarRating";
import { ShoppingCart, ArrowLeft } from "lucide-react";
import "./ProductPage.css";

interface ProductReview {
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

export const ProductPage = () => {
  const { id } = useParams<{ id: string }>();
  const allProducts = useAtomValue(productsAtom);
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const setCartItems = useSetAtom(storeCartItemsAtom);

  const [product, setProduct] = useState<Product | null>(null);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [loadingProduct, setLoadingProduct] = useState(true);
  const [addingToCart, setAddingToCart] = useState(false);

  useEffect(() => {
    // Attempt to load from atom first
    const cached = allProducts.find((p) => String(p.id) === id);
    if (cached) {
      setProduct(cached);
      setLoadingProduct(false);
    } else {
      // Fetch product if not cached
      apiRequest<Product>(`/store/products/${id}`)
        .then((p) => {
          if (p) setProduct(p);
        })
        .catch((err) => {
          console.error("Failed to load product", err);
          toast.error("Product not found");
        })
        .finally(() => setLoadingProduct(false));
    }
  }, [id, allProducts]);

  const loadReviews = async () => {
    setReviewsLoading(true);
    try {
      const data = await apiRequest<any[]>(`/store/products/${id}/reviews`);
      const mappedReviews: ProductReview[] = (data || []).map((r) => ({
        id: r.id,
        author_id: r.user?.id || r.user_id,
        author_name: r.user?.display_name,
        author_avatar: r.user?.avatar_url,
        author_username: r.user?.username,
        content: r.comment,
        created_at: r.created_at,
        rating: r.rating,
        can_delete: r.can_delete,
      }));
      setReviews(mappedReviews);
    } catch (err) {
      console.error(err);
    } finally {
      setReviewsLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      void loadReviews();
    }
  }, [id]);

  const userHasReviewed = useMemo(() => {
    if (!currentUser) return false;
    return reviews.some((r) => String(r.author_id) === String(currentUser.id));
  }, [reviews, currentUser]);

  const handleReviewSubmit = async (text: string, rating?: number) => {
    try {
      await apiRequest(`/store/products/${id}/reviews`, {
        method: "POST",
        body: JSON.stringify({ rating, comment: text }),
      });
      toast.success("Review submitted!");
      await loadReviews();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit review");
    }
  };

  const handleAddToCart = async () => {
    if (!product) return;
    setAddingToCart(true);
    try {
      await apiRequest("/store/cart/add", {
        method: "POST",
        body: JSON.stringify({ product_id: product.id, quantity: 1 }),
      });

      // Update local cart state
      setCartItems((prev) => {
        const exists = prev.find(
          (i) => i.product?.id === product.id || i.product_id === product.id,
        );
        if (exists) {
          return prev.map((i) =>
            i.product?.id === product.id || i.product_id === product.id
              ? { ...i, quantity: i.quantity + 1 }
              : i,
          );
        }
        return [
          ...prev,
          {
            id: `temp-${Date.now()}`,
            user_id: currentUser?.id ?? "0",
            product_id: product.id,
            quantity: 1,
            added_at: new Date().toISOString(),
            product: product,
          },
        ];
      });

      toast.success("Added to cart");
    } catch (err: any) {
      toast.error(err.message || "Could not add to cart");
    } finally {
      setAddingToCart(false);
    }
  };

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
    return sum / reviews.length;
  }, [reviews]);

  if (loadingProduct) {
    return <div className="product-page-loading">Loading...</div>;
  }

  if (!product) {
    return <div className="product-page-not-found">Product not found</div>;
  }

  return (
    <div className="product-page-container">
      <div className="product-page-back">
        <Link to="/store" className="btn">
          <ArrowLeft size={16} /> Back to Store
        </Link>
      </div>

      <div className="product-page-layout">
        <div className="product-page-left">
          <div className="product-page-card">
            {product.image_url && (
              <img
                src={product.image_url}
                alt={product.name}
                className="product-page-image"
              />
            )}
            <div className="product-page-details">
              <h1>{product.name}</h1>
              <div className="product-page-price">
                <span className="current-price">
                  ${(product.price / 100).toFixed(2)}
                </span>
                {product.original_price && (
                  <span className="original-price">
                    ${(product.original_price / 100).toFixed(2)}
                  </span>
                )}
              </div>
              <div className="product-page-rating-summary">
                <StarRating
                  rating={Math.round(averageRating)}
                  disabled
                  size={18}
                />
                <span
                  style={{
                    marginLeft: "0.5rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
                </span>
              </div>
              <p className="product-page-description">{product.description}</p>

              <div className="product-page-stock">
                {product.stock_unlimited
                  ? "In Stock"
                  : `${product.stock} available`}
              </div>

              <div className="product-page-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleAddToCart}
                  disabled={
                    !product.is_active ||
                    (!product.stock_unlimited && product.stock <= 0) ||
                    addingToCart
                  }
                >
                  <ShoppingCart size={18} />
                  {addingToCart ? "Adding..." : "Add to Cart"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="product-page-right">
          <CommentSection
            title="Product Reviews"
            comments={reviews}
            isLoading={reviewsLoading}
            canComment={isAuthenticated}
            enableRatings={true}
            userHasReviewed={userHasReviewed}
            onSubmit={handleReviewSubmit}
            currentUserId={currentUser?.id}
            noCommentsText="No reviews yet. Be the first to review!"
            placeholder="Write a review..."
          />
        </div>
      </div>
    </div>
  );
};
