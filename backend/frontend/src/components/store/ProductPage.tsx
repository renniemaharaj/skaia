import { useAtomValue, useSetAtom } from "jotai";
import {
  ChevronRight,
  Clock,
  Edit2,
  LayoutGrid,
  Package,
  Share2,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  User,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
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
import { apiRequest } from "../../utils/api";
import "./ProductPage.css";
import { formatCents } from "../../utils/money";
import { ContentFlatCard } from "../cards/ContentFlatCard";
import { MediaPreviewLightbox } from "../ui/MediaPreviewLightbox";
import { ProductMediaTable } from "./ProductMediaTable";
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

const getProductMedia = (product: Product) =>
  product.media && product.media.length > 0
    ? product.media
    : product.image_url
      ? [
          {
            url: product.image_url,
            filename: product.image_url.split("/").pop() || product.name,
            mime_type: "",
            type: "image",
            size: 0,
            created_at: product.created_at,
          },
        ]
      : [];

interface ProductTwoUpCardProps {
  product: Product;
  onPreview: (index: number) => void;
  onAddToCart: (product: Product) => void;
  addingToCart: boolean;
}

function ProductTwoUpCard({
  product,
  onPreview,
  onAddToCart,
  addingToCart,
}: ProductTwoUpCardProps) {
  const media = getProductMedia(product);
  const isSoldOut = !product.stock_unlimited && product.stock <= 0;

  return (
    <ContentFlatCard className="product-two-up-card">
      <div className={`product-two-up-media${!media[0] ? " fallback" : ""}`}>
        {media[0] ? (
          <img src={media[0].url} alt={product.name} onClick={() => onPreview(0)} />
        ) : (
          <Package size={40} />
        )}
      </div>
      <div className="product-two-up-body">
        <div className="product-two-up-heading">
          <h2>{product.name}</h2>
          <span>{formatCents(product.price)}</span>
        </div>
        <p>{product.description}</p>
        <div className="product-page-meta-grid">
          <span>
            <User size={14} /> {product.owner?.display_name || "Store"}
          </span>
          <span>
            <ShoppingBag size={14} /> {product.recent_purchases ?? 0} purchases
          </span>
          <span>
            <TrendingUp size={14} /> {product.current_orders ?? 0} current orders
          </span>
          <span>
            <Clock size={14} /> {new Date(product.updated_at).toLocaleDateString()}
          </span>
        </div>
        <button
          className="btn-add-to-cart"
          onClick={() => onAddToCart(product)}
          disabled={!product.is_active || isSoldOut || addingToCart}
        >
          <ShoppingCart size={14} />
          {addingToCart ? "Adding..." : isSoldOut ? "Sold Out" : "Add to Cart"}
        </button>
      </div>
    </ContentFlatCard>
  );
}

export const ProductPage = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const allProducts = useAtomValue(productsAtom);
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const currentUser = useAtomValue(currentUserAtom);
  const setCartItems = useSetAtom(storeCartItemsAtom);
  const categories = useAtomValue(productCategoriesAtom);
  const setLayoutMode = useSetAtom(layoutModeAtom);
  const [guestSandboxMode] = useGuestSandboxMode();

  const [product, setProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedMediaIndex, setSelectedMediaIndex] = useState<number | null>(null);
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [loadingProduct, setLoadingProduct] = useState(true);
  const [addingToCart, setAddingToCart] = useState(false);
  const [similarProducts, setSimilarProducts] = useState<Product[]>([]);
  const [similarLoading, setSimilarLoading] = useState(true);
  const isTwoUpLayout = searchParams.get("layout") === "two-up";

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

  const loadReviews = async () => {
    setReviewsLoading(true);
    try {
      const data = await apiRequest<any[]>(`/store/products/${id}/reviews`);
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
  };

  useEffect(() => {
    if (id) {
      void loadReviews();
    }
  }, [id]);

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
    } catch (err: any) {
      toast.error(err.message || "Failed to submit review");
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
    } catch (err: any) {
      toast.error(err.message || "Could not add to cart");
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
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} style={{ display: "flex", gap: 12, marginBottom: 10 }}>
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
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="skeleton-card" style={{ padding: 12, marginBottom: 12 }}>
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
  const media = getProductMedia(product);
  const pairedProduct =
    similarProducts[0] ??
    allProducts.find(
      p => String(p.id) !== String(product.id) && p.category_id === product.category_id
    ) ??
    allProducts.find(p => String(p.id) !== String(product.id));
  const setTwoUpLayout = (next: boolean) => {
    const params = new URLSearchParams(searchParams);
    if (next) params.set("layout", "two-up");
    else params.delete("layout");
    setSearchParams(params);
  };
  const formatDateTime = (value: string) =>
    new Date(value).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  if (isTwoUpLayout) {
    const pairedMedia = pairedProduct ? getProductMedia(pairedProduct) : [];
    const previewItems = [...media, ...pairedMedia];
    const pairedOffset = media.length;

    return (
      <StorePageShell className="product-page-container" backTo="/store">
        <div className="product-two-up-shell">
          <div className="product-two-up-toolbar">
            <button
              className="action-btn edit-btn"
              title="Full product view"
              onClick={() => setTwoUpLayout(false)}
            >
              <LayoutGrid size={15} />
            </button>
            <button className="action-btn edit-btn" title="Share product" onClick={handleShare}>
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
          </div>
          <div className="product-two-up-grid">
            <ProductTwoUpCard
              product={product}
              onPreview={setSelectedMediaIndex}
              onAddToCart={addProductToCart}
              addingToCart={addingToCart}
            />
            {pairedProduct ? (
              <ProductTwoUpCard
                product={pairedProduct}
                onPreview={index => setSelectedMediaIndex(pairedOffset + index)}
                onAddToCart={addProductToCart}
                addingToCart={addingToCart}
              />
            ) : (
              <ContentFlatCard className="product-two-up-card product-two-up-empty">
                <Package size={40} />
              </ContentFlatCard>
            )}
          </div>
        </div>

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

        {selectedMediaIndex !== null && (
          <MediaPreviewLightbox
            items={previewItems}
            index={selectedMediaIndex}
            onIndexChange={setSelectedMediaIndex}
            onClose={() => setSelectedMediaIndex(null)}
          />
        )}
      </StorePageShell>
    );
  }

  return (
    <StorePageShell className="product-page-container" backTo="/store">
      <div className="product-page-layout">
        {/* ── Hero: image + details ── */}
        <ContentFlatCard className="product-page-hero">
          <div className={`product-page-image-container${!product.image_url ? " fallback" : ""}`}>
            {media[0] ? (
              <img
                src={media[0].url}
                alt={product.name}
                className="product-page-image"
                onClick={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSelectedMediaIndex(0);
                }}
              />
            ) : (
              <Package size={48} style={{ opacity: 0.25 }} />
            )}
          </div>

          <div className="product-page-details">
            <h1>{product.name}</h1>

            <div className="product-page-price">
              <span className="current-price">{formatCents(product.price)}</span>
              {product.original_price && (
                <span className="original-price">{formatCents(product.original_price)}</span>
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
                className="action-btn edit-btn"
                title="Two-up product view"
                onClick={() => setTwoUpLayout(true)}
              >
                <LayoutGrid size={15} />
              </button>

              <button className="action-btn edit-btn" title="Share product" onClick={handleShare}>
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
                {addingToCart ? "Adding…" : isSoldOut ? "Sold Out" : "Add to Cart"}
              </button>
            </div>
          </div>
        </ContentFlatCard>

        <ContentFlatCard className="product-page-media-section">
          <div className="product-page-section-label">Product Media</div>
          <ProductMediaTable media={media} />
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
                  : similarProducts.map(sp => (
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
                          <span className="similar-product-name">{sp.name}</span>
                          <span className="similar-product-price">{formatCents(sp.price)}</span>
                        </div>
                        <ChevronRight size={14} className="similar-product-arrow" />
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
              .then(p => {
                if (p) setProduct(p);
              })
              .finally(() => setLoadingProduct(false));
          }}
        />
      )}

      {selectedMediaIndex !== null && (
        <MediaPreviewLightbox
          items={media}
          index={selectedMediaIndex}
          onIndexChange={setSelectedMediaIndex}
          onClose={() => setSelectedMediaIndex(null)}
        />
      )}
    </StorePageShell>
  );
};
