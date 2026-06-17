import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useAtomValue, useSetAtom } from "jotai";
import { toast } from "sonner";
import {
  productsAtom,
  storeCartItemsAtom,
  productCategoriesAtom,
  type Product,
} from "../../atoms/store";
import { isAuthenticatedAtom, currentUserAtom } from "../../atoms/auth";
import { apiRequest } from "../../utils/api";
import CommentSection from "../../components/comments/CommentSection";
import StarRating from "../../components/ui/StarRating";
import {
  ShoppingCart,
  Package,
  Share2,
  Edit2,
  ChevronRight,
} from "lucide-react";
import { EditProductDialog } from "../../components/store/EditProductDialog";
import { useGuestSandboxMode } from "../../hooks/useGuestSandboxMode";
import { layoutModeAtom } from "../../atoms/layoutMode";
import { createPortal } from "react-dom";
import "./ProductPage.css";
import { formatCents } from "../../utils/money";
import { ContentFlatCard } from "../cards/ContentFlatCard";
import { StorePageShell } from "./StorePageShell";

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
  const categories = useAtomValue(productCategoriesAtom);
  const setLayoutMode = useSetAtom(layoutModeAtom);
  const [guestSandboxMode] = useGuestSandboxMode();

  const canEditProduct =
    currentUser?.permissions?.includes("store.product-edit") ||
    guestSandboxMode;

  const [product, setProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [loadingProduct, setLoadingProduct] = useState(true);
  const [addingToCart, setAddingToCart] = useState(false);
  const [similarProducts, setSimilarProducts] = useState<Product[]>([]);
  const [similarLoading, setSimilarLoading] = useState(true);

  useEffect(() => {
    setLayoutMode("application");
    return () => setLayoutMode("web");
  }, [setLayoutMode]);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Link copied to clipboard!");
  };

  useEffect(() => {
    const cached = allProducts.find((p) => String(p.id) === id);
    if (cached) {
      setProduct(cached);
      setLoadingProduct(false);
    } else {
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

  useEffect(() => {
    if (!id) return;
    setSimilarLoading(true);
    apiRequest<Product[]>(`/store/products/${id}/similar`)
      .then((data) => {
        setSimilarProducts(data || []);
      })
      .catch(() => {
        setSimilarProducts([]);
      })
      .finally(() => setSimilarLoading(false));
  }, [id]);

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
    return (
      <StorePageShell className="product-page-container" backTo="/store">
        <div className="product-page-layout">
          <div className="product-page-hero">
            <div className="product-page-image-container">
              <div
                className="skeleton"
                style={{ width: "100%", height: "100%" }}
              />
            </div>

            <div className="product-page-details">
              <div
                className="skeleton skeleton-heading"
                style={{ width: "60%", height: 28 }}
              />

              <div
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  alignItems: "center",
                }}
              >
                <div
                  className="skeleton skeleton-text"
                  style={{ width: 120, height: 20 }}
                />
                <div
                  className="skeleton skeleton-text"
                  style={{ width: 80, height: 16 }}
                />
              </div>

              <div
                className="skeleton skeleton-text"
                style={{ width: "40%", height: 12 }}
              />
              <div
                className="skeleton skeleton-text"
                style={{ width: "80%", height: 12 }}
              />
              <div
                className="skeleton skeleton-text"
                style={{ width: "70%", height: 12 }}
              />

              <div style={{ display: "flex", gap: "0.5rem", marginTop: 12 }}>
                <div
                  className="skeleton"
                  style={{ height: 36, width: 100, borderRadius: 8 }}
                />
                <div
                  className="skeleton"
                  style={{ height: 36, width: 80, borderRadius: 8 }}
                />
              </div>
            </div>
          </div>

          <div className="product-page-bottom">
            <div>
              <div
                className="skeleton skeleton-heading"
                style={{ width: 140, height: 18 }}
              />
              <div style={{ marginTop: 12 }}>
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    style={{ display: "flex", gap: 12, marginBottom: 10 }}
                  >
                    <div
                      className="skeleton skeleton-circle"
                      style={{ width: 44, height: 44 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div
                        className="skeleton skeleton-text"
                        style={{ width: `${55 + (i % 3) * 15}%`, height: 12 }}
                      />
                      <div
                        className="skeleton skeleton-text"
                        style={{ width: "30%", height: 10 }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div
                className="skeleton skeleton-heading"
                style={{ width: 140, height: 18 }}
              />
              <div style={{ marginTop: 12 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div
                    key={i}
                    className="skeleton-card"
                    style={{ padding: 12, marginBottom: 12 }}
                  >
                    <div style={{ display: "flex", gap: 12 }}>
                      <div
                        className="skeleton skeleton-circle"
                        style={{ width: 36, height: 36 }}
                      />
                      <div style={{ flex: 1 }}>
                        <div
                          className="skeleton skeleton-text"
                          style={{ width: "40%", height: 12 }}
                        />
                        <div
                          className="skeleton skeleton-text"
                          style={{ width: "80%", height: 12 }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </StorePageShell>
    );
  }

  if (!product) {
    return (
      <StorePageShell className="product-page-container" backTo="/store">
        <div className="product-page-not-found">Product not found</div>
      </StorePageShell>
    );
  }

  const isSoldOut = !product.stock_unlimited && product.stock <= 0;

  return (
    <StorePageShell className="product-page-container" backTo="/store">
      <div className="product-page-layout">
        {/* ── Hero: image + details ── */}
        <ContentFlatCard className="product-page-hero">
          <div
            className={`product-page-image-container${!product.image_url ? " fallback" : ""}`}
          >
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="product-page-image"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelectedImage(product.image_url ?? null);
                }}
              />
            ) : (
              <Package size={48} style={{ opacity: 0.25 }} />
            )}
          </div>

          <div className="product-page-details">
            <h1>{product.name}</h1>

            <div className="product-page-price">
              <span className="current-price">
                {formatCents(product.price)}
              </span>
              {product.original_price && (
                <span className="original-price">
                  {formatCents(product.original_price)}
                </span>
              )}
            </div>

            <div className="product-page-rating-summary">
              <StarRating
                rating={Math.round(averageRating)}
                disabled
                size={15}
              />
              <span>
                {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
              </span>
            </div>

            <p className="product-page-description">{product.description}</p>

            <div className="product-page-stock">
              {product.stock_unlimited
                ? "In Stock"
                : `${product.stock} available`}
            </div>

            <div className="product-page-actions-row">
              <button
                className="action-btn edit-btn"
                title="Share product"
                onClick={handleShare}
              >
                <Share2 size={15} />
              </button>

              {canEditProduct && (
                <button
                  className="action-btn edit-btn"
                  title="Edit product"
                  onClick={() => setEditingProduct(product)}
                >
                  <Edit2 size={15} />
                </button>
              )}

              <button
                className="btn-add-to-cart"
                onClick={handleAddToCart}
                disabled={!product.is_active || isSoldOut || addingToCart}
              >
                <ShoppingCart size={14} />
                {addingToCart
                  ? "Adding…"
                  : isSoldOut
                    ? "Sold Out"
                    : "Add to Cart"}
              </button>
            </div>
          </div>
        </ContentFlatCard>

        {/* ── Bottom: similar products + reviews ── */}
        <div className="product-page-bottom">
          {/* Similar products */}
          <div className="product-page-similar">
            <div className="product-page-section-label">Similar Products</div>
            <div className="similar-product-list">
              {similarLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div className="similar-skeleton-item" key={i}>
                      <div className="similar-skeleton-thumb skeleton" />
                      <div className="similar-skeleton-lines">
                        <div
                          className="similar-skeleton-name skeleton"
                          style={{ width: `${55 + (i % 3) * 15}%` }}
                        />
                        <div className="similar-skeleton-price skeleton" />
                      </div>
                    </div>
                  ))
                : similarProducts.length === 0
                  ? Array.from({ length: 2 }).map((_, i) => (
                      <div className="similar-skeleton-item" key={`empty-${i}`}>
                        <div className="similar-skeleton-thumb skeleton" />
                        <div className="similar-skeleton-lines">
                          <div
                            className="similar-skeleton-name skeleton"
                            style={{ width: `${55 + (i % 2) * 20}%` }}
                          />
                          <div className="similar-skeleton-price skeleton" />
                        </div>
                      </div>
                    ))
                  : similarProducts.map((sp) => (
                      <Link
                        key={sp.id}
                        to={`/store/products/${sp.id}`}
                        className="similar-product-item"
                      >
                        <div className="similar-product-thumb">
                          {sp.image_url ? (
                            <img src={sp.image_url} alt={sp.name} />
                          ) : (
                            <Package size={18} />
                          )}
                        </div>
                        <div className="similar-product-info">
                          <span className="similar-product-name">
                            {sp.name}
                          </span>
                          <span className="similar-product-price">
                            {formatCents(sp.price)}
                          </span>
                        </div>
                        <ChevronRight
                          size={14}
                          className="similar-product-arrow"
                        />
                      </Link>
                    ))}
            </div>
          </div>

          {/* Reviews */}
          <div className="product-page-reviews">
            <div className="product-page-section-label">Product Reviews</div>
            <CommentSection
              title=""
              comments={reviews}
              isLoading={reviewsLoading}
              canComment={isAuthenticated}
              enableRatings={true}
              userHasReviewed={userHasReviewed}
              onSubmit={handleReviewSubmit}
              currentUserId={currentUser?.id}
              noCommentsText="No reviews yet. Be the first to review!"
              placeholder="Write a review…"
            />
          </div>
        </div>
      </div>

      {/* Edit dialog */}
      {editingProduct && (
        <EditProductDialog
          isOpen={!!editingProduct}
          product={editingProduct}
          categories={categories}
          onClose={() => setEditingProduct(null)}
          onSuccess={() => {
            setLoadingProduct(true);
            apiRequest<Product>(`/store/products/${id}`)
              .then((p) => {
                if (p) setProduct(p);
              })
              .finally(() => setLoadingProduct(false));
          }}
        />
      )}

      {/* Lightbox */}
      {selectedImage &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="up-upload-lightbox"
            onClick={() => setSelectedImage(null)}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 9999,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--overlay-dark-heavy)",
            }}
          >
            <div
              className="up-upload-lightbox-content"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: "90vw",
                maxHeight: "90vh",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <img
                src={selectedImage}
                alt="Preview"
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                }}
              />
            </div>
          </div>,
          document.body,
        )}
    </StorePageShell>
  );
};
