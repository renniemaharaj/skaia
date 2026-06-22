import { useAtomValue, useSetAtom } from "jotai";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit2,
  Package,
  Share2,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  User,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { currentUserAtom, isAuthenticatedAtom } from "../../atoms/auth";
import { layoutModeAtom } from "../../atoms/layoutMode";
import {
  type Product,
  productCategoriesAtom,
  productsAtom,
  storeCartItemsAtom,
} from "../../atoms/store";
import CommentSection from "../../components/comments/CommentSection";
import { EditProductDialog } from "../../components/store/EditProductDialog";
import StarRating from "../../components/ui/StarRating";
import { useGuestSandboxMode } from "../../hooks/useGuestSandboxMode";
import { useWebSocketSync } from "../../hooks/useWebSocketSync";
import { apiRequest } from "../../utils/api";
import "./ProductPage.css";
import { ContentFlatCard } from "../cards/ContentFlatCard";
import { ContentStandOutCard } from "../cards/ContentStandOutCard";
import { MoneyAmount } from "../ui/MoneyAmount";
import { MediaPreviewLightbox } from "../ui/MediaPreviewLightbox";
import { ProductMediaTable } from "./ProductMediaTable";
import { StorePageShell } from "./StorePageShell";
import { getProductMediaItems } from "./storeMedia";

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

interface ProductReviewApiResponse {
  id: string | number;
  user_id?: string | number | null;
  user?: {
    id?: string | number | null;
    display_name?: string | null;
    avatar_url?: string | null;
    username?: string | null;
  } | null;
  comment: string;
  created_at: string;
  rating?: number;
  can_delete?: boolean;
}

const REVIEW_SKELETON_KEYS = [
  "review-skeleton-1",
  "review-skeleton-2",
  "review-skeleton-3",
  "review-skeleton-4",
];

const SIMILAR_SKELETON_KEYS = [
  "similar-skeleton-1",
  "similar-skeleton-2",
  "similar-skeleton-3",
  "similar-skeleton-4",
];

const RELATED_SKELETON_KEYS = ["related-skeleton-1", "related-skeleton-2", "related-skeleton-3"];

const errorMessage = (err: unknown, fallback: string) =>
  err instanceof Error && err.message ? err.message : fallback;

export const ProductPage = () => {
  const { id } = useParams<{ id: string }>();
  const allProducts = useAtomValue(productsAtom);
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const setCartItems = useSetAtom(storeCartItemsAtom);
  const categories = useAtomValue(productCategoriesAtom);
  const setLayoutMode = useSetAtom(layoutModeAtom);
  const [guestSandboxMode] = useGuestSandboxMode();
  const { subscribe, unsubscribe } = useWebSocketSync();

  const [product, setProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [previewMediaIndex, setPreviewMediaIndex] = useState<number | null>(null);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [loadingProduct, setLoadingProduct] = useState(true);
  const [addingToCart, setAddingToCart] = useState(false);
  const [similarProducts, setSimilarProducts] = useState<Product[]>([]);
  const [similarLoading, setSimilarLoading] = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);

  const canEditProduct =
    currentUser?.permissions?.includes("store.product-edit") ||
    (currentUser?.permissions?.includes("store.product-seller") &&
      product?.owner_id &&
      String(product.owner_id) === String(currentUser.id)) ||
    guestSandboxMode;

  useEffect(() => {
    setLayoutMode("application");
    return () => setLayoutMode("web");
  }, [setLayoutMode]);

  useEffect(() => {
    if (!id) return;
    setActiveMediaIndex(0);
    setPreviewMediaIndex(null);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    subscribe("store_product", id);
    return () => unsubscribe("store_product", id);
  }, [id, subscribe, unsubscribe]);

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Link copied to clipboard!");
  };

  useEffect(() => {
    const cached = allProducts.find(p => String(p.id) === id);
    if (cached) {
      setProduct(cached);
      setLoadingProduct(false);
    } else {
      apiRequest<Product>(`/store/products/${id}`)
        .then(p => {
          if (p) setProduct(p);
        })
        .catch(err => {
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
      .then(data => {
        setSimilarProducts(data || []);
      })
      .catch(() => {
        setSimilarProducts([]);
      })
      .finally(() => setSimilarLoading(false));
  }, [id]);

  const loadReviews = useCallback(async () => {
    setReviewsLoading(true);
    try {
      const data = await apiRequest<ProductReviewApiResponse[]>(`/store/products/${id}/reviews`);
      const mappedReviews: ProductReview[] = (data || []).map(r => ({
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
  }, [id]);

  useEffect(() => {
    if (id) {
      void loadReviews();
    }
  }, [id, loadReviews]);

  const userHasReviewed = useMemo(() => {
    if (!currentUser) return false;
    return reviews.some(r => String(r.author_id) === String(currentUser.id));
  }, [reviews, currentUser]);

  const handleReviewSubmit = async (text: string, rating?: number) => {
    try {
      await apiRequest(`/store/products/${id}/reviews`, {
        method: "POST",
        body: JSON.stringify({ rating, comment: text }),
      });
      toast.success("Review submitted!");
      await loadReviews();
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Failed to submit review"));
    }
  };

  const addProductToCart = async (targetProduct: Product) => {
    setAddingToCart(true);
    try {
      await apiRequest("/store/cart/add", {
        method: "POST",
        body: JSON.stringify({ product_id: targetProduct.id, quantity: 1 }),
      });

      setCartItems(prev => {
        const exists = prev.find(
          i => i.product?.id === targetProduct.id || i.product_id === targetProduct.id
        );
        if (exists) {
          return prev.map(i =>
            i.product?.id === targetProduct.id || i.product_id === targetProduct.id
              ? { ...i, quantity: i.quantity + 1 }
              : i
          );
        }
        return [
          ...prev,
          {
            id: `temp-${Date.now()}`,
            user_id: currentUser?.id ?? "0",
            product_id: targetProduct.id,
            quantity: 1,
            added_at: new Date().toISOString(),
            product: targetProduct,
          },
        ];
      });

      toast.success("Added to cart");
    } catch (err: unknown) {
      toast.error(errorMessage(err, "Could not add to cart"));
    } finally {
      setAddingToCart(false);
    }
  };

  const handleAddToCart = async () => {
    if (!product) return;
    await addProductToCart(product);
  };

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return 0;
    const sum = reviews.reduce((acc, r) => acc + (r.rating || 0), 0);
    return sum / reviews.length;
  }, [reviews]);

  const media = product ? getProductMediaItems(product) : [];
  const canCycleMedia = media.length > 1;

  useEffect(() => {
    if (hasInteracted || !canCycleMedia || media.length === 0) return;
    const interval = setInterval(() => {
      setActiveMediaIndex(index => (index + 1) % media.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [hasInteracted, canCycleMedia, media.length]);

  if (loadingProduct) {
    return (
      <StorePageShell className="product-page-container" backTo="/store">
        <div className="product-page-layout">
          <div className="product-page-hero">
            <div className="product-page-image-container">
              <div className="skeleton" style={{ width: "100%", height: "100%" }} />
            </div>

            <div className="product-page-details">
              <div className="skeleton skeleton-heading" style={{ width: "60%", height: 28 }} />

              <div
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  alignItems: "center",
                }}
              >
                <div className="skeleton skeleton-text" style={{ width: 120, height: 20 }} />
                <div className="skeleton skeleton-text" style={{ width: 80, height: 16 }} />
              </div>

              <div className="skeleton skeleton-text" style={{ width: "40%", height: 12 }} />
              <div className="skeleton skeleton-text" style={{ width: "80%", height: 12 }} />
              <div className="skeleton skeleton-text" style={{ width: "70%", height: 12 }} />

              <div style={{ display: "flex", gap: "0.5rem", marginTop: 12 }}>
                <div className="skeleton" style={{ height: 36, width: 100, borderRadius: 8 }} />
                <div className="skeleton" style={{ height: 36, width: 80, borderRadius: 8 }} />
              </div>
            </div>
          </div>

          <div className="product-page-bottom">
            <div>
              <div className="skeleton skeleton-heading" style={{ width: 140, height: 18 }} />
              <div style={{ marginTop: 12 }}>
                {REVIEW_SKELETON_KEYS.map((key, i) => (
                  <div key={key} style={{ display: "flex", gap: 12, marginBottom: 10 }}>
                    <div className="skeleton skeleton-circle" style={{ width: 44, height: 44 }} />
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
              <div className="skeleton skeleton-heading" style={{ width: 140, height: 18 }} />
              <div style={{ marginTop: 12 }}>
                {RELATED_SKELETON_KEYS.map(key => (
                  <ContentFlatCard
                    key={key}
                    className="skeleton-card"
                    style={{ padding: 12, marginBottom: 12 }}
                  >
                    <div style={{ display: "flex", gap: 12 }}>
                      <div className="skeleton skeleton-circle" style={{ width: 36, height: 36 }} />
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
                  </ContentFlatCard>
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
  const productCategoryName = categories.find(cat => cat.id === product.category_id)?.name;
  const safeActiveMediaIndex =
    media.length > 0 ? Math.min(Math.max(activeMediaIndex, 0), media.length - 1) : 0;
  const activeMedia = media[safeActiveMediaIndex];
  const activeMediaIsVideo =
    activeMedia?.mime_type?.startsWith("video/") || activeMedia?.type === "video";

  const previousMedia = () => {
    setHasInteracted(true);
    setActiveMediaIndex(index => (index - 1 + media.length) % media.length);
  };
  const nextMedia = () => {
    setHasInteracted(true);
    setActiveMediaIndex(index => (index + 1) % media.length);
  };

  const formatDateTime = (value: string) =>
    new Date(value).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <StorePageShell className="product-page-container" backTo="/store">
      <div className="product-page-layout">
        {/* ── Hero: image + details ── */}
        <ContentStandOutCard className="product-page-hero">
          <div className={`product-page-image-container${!activeMedia ? " fallback" : ""}`}>
            {activeMedia ? (
              <button
                type="button"
                className="product-page-image-button"
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  setHasInteracted(true);
                  setPreviewMediaIndex(safeActiveMediaIndex);
                }}
              >
                {activeMediaIsVideo ? (
                  <video src={activeMedia.url} preload="metadata" muted playsInline>
                    <track kind="captions" />
                  </video>
                ) : (
                  <img src={activeMedia.url} alt={activeMedia.filename || product.name} />
                )}
              </button>
            ) : (
              <Package size={48} style={{ opacity: 0.25 }} />
            )}
            {canCycleMedia && (
              <>
                <button
                  type="button"
                  className="action-btn btn-ghost product-page-media-cycle product-page-media-cycle--prev"
                  onClick={event => {
                    event.stopPropagation();
                    previousMedia();
                  }}
                  title="Previous media"
                  aria-label="Previous media"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  className="action-btn btn-ghost product-page-media-cycle product-page-media-cycle--next"
                  onClick={event => {
                    event.stopPropagation();
                    nextMedia();
                  }}
                  title="Next media"
                  aria-label="Next media"
                >
                  <ChevronRight size={18} />
                </button>
              </>
            )}
            {activeMedia && (
              <div className="up-upload-lightbox-bar product-page-media-bar">
                <span className="up-upload-lightbox-name">{activeMedia.filename}</span>
                <div className="thread-actions">
                  <span className="up-upload-lightbox-count">
                    {safeActiveMediaIndex + 1}/{media.length}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="product-page-details">
            <h1>{product.name}</h1>

            <div className="product-page-price">
              <MoneyAmount cents={product.price} className="current-price" />
              {product.original_price && (
                <MoneyAmount cents={product.original_price} className="original-price" />
              )}
            </div>

            <div className="product-page-rating-summary">
              <StarRating rating={Math.round(averageRating)} disabled size={15} />
              <span>
                {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
              </span>
            </div>

            <p className="product-page-description">{product.description}</p>

            <div className="product-page-meta-grid">
              <span>
                <User size={14} /> {product.owner?.display_name || "Store"}
              </span>
              <span>
                <Clock size={14} /> Created {formatDateTime(product.created_at)}
              </span>
              <span>
                <Clock size={14} /> Updated {formatDateTime(product.updated_at)}
              </span>
              <span>
                <ShoppingBag size={14} /> {product.recent_purchases ?? 0} recent purchases
              </span>
              <span>
                <TrendingUp size={14} /> {product.current_orders ?? 0} current orders
              </span>
            </div>

            <div className="product-page-stock">
              {product.stock_unlimited ? "In Stock" : `${product.stock} available`}
            </div>

            <div className="product-page-actions-row">
              <button
                type="button"
                className="action-btn edit-btn"
                title="Share product"
                onClick={handleShare}
              >
                <Share2 size={15} />
              </button>

              {canEditProduct && (
                <button
                  type="button"
                  className="action-btn edit-btn"
                  title="Edit product"
                  onClick={() => setEditingProduct(product)}
                >
                  <Edit2 size={15} />
                </button>
              )}

              <button
                type="button"
                className="btn-add-to-cart"
                onClick={handleAddToCart}
                disabled={!product.is_active || isSoldOut || addingToCart}
              >
                <ShoppingCart size={14} />
                {addingToCart ? "Adding…" : isSoldOut ? "Sold Out" : "Add to Cart"}
              </button>
            </div>
          </div>
        </ContentStandOutCard>

        <ContentFlatCard className="product-page-media-section">
          <div className="product-page-section-label">Product Media</div>
          <ProductMediaTable media={media} />
        </ContentFlatCard>

        {/* ── Bottom: similar products + reviews ── */}
        <div className="product-page-bottom">
          {/* Similar products */}
          <div className="product-page-similar">
            <div className="product-page-section-heading">
              <div>
                <div className="product-page-section-label">Similar Products</div>
                {productCategoryName && (
                  <p className="product-page-section-context">{productCategoryName}</p>
                )}
              </div>
              {similarProducts.length > 0 && (
                <Link
                  className="product-page-section-link"
                  to={`/store?category=${product.category_id}`}
                >
                  View category
                </Link>
              )}
            </div>
            <div className="similar-product-list">
              {similarLoading ? (
                SIMILAR_SKELETON_KEYS.map((key, i) => (
                  <div className="similar-skeleton-item" key={key}>
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
              ) : similarProducts.length === 0 ? (
                <div className="similar-products-empty">
                  <Package size={18} />
                  <span>No other products in this category yet.</span>
                </div>
              ) : (
                similarProducts.map(sp => {
                  const similarCover = getProductMediaItems(sp)[0];
                  const similarCoverIsVideo =
                    similarCover?.mime_type?.startsWith("video/") || similarCover?.type === "video";
                  const similarStockLabel = sp.stock_unlimited
                    ? "In stock"
                    : sp.stock > 0
                      ? `${sp.stock} available`
                      : "Sold out";
                  return (
                    <Link
                      key={sp.id}
                      to={`/store/product/${sp.id}`}
                      className="similar-product-item"
                    >
                      <div className="similar-product-thumb">
                        {similarCover && similarCoverIsVideo ? (
                          <video src={similarCover.url} preload="metadata" muted playsInline>
                            <track kind="captions" />
                          </video>
                        ) : similarCover ? (
                          <img src={similarCover.url} alt={sp.name} />
                        ) : (
                          <Package size={18} />
                        )}
                      </div>
                      <div className="similar-product-info">
                        <span className="similar-product-name">{sp.name}</span>
                        {sp.description && (
                          <span className="similar-product-description">{sp.description}</span>
                        )}
                        <span className="similar-product-meta">
                          <MoneyAmount cents={sp.price} className="similar-product-price" />
                          <span>{similarStockLabel}</span>
                        </span>
                      </div>
                      <ChevronRight size={14} className="similar-product-arrow" />
                    </Link>
                  );
                })
              )}
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
              .then(p => {
                if (p) setProduct(p);
              })
              .finally(() => setLoadingProduct(false));
          }}
        />
      )}

      {previewMediaIndex !== null && (
        <MediaPreviewLightbox
          items={media}
          index={previewMediaIndex}
          onIndexChange={index => {
            setPreviewMediaIndex(index);
            setActiveMediaIndex(index);
          }}
          onClose={() => setPreviewMediaIndex(null)}
        />
      )}
    </StorePageShell>
  );
};
