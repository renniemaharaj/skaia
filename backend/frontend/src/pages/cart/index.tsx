import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ShoppingCart,
  Trash2,
  Loader,
  MapPin,
  Phone,
  Mail,
} from "lucide-react";
import { useAtom, useAtomValue } from "jotai";
import { toast } from "sonner";
import {
  storeCartItemsAtom,
  productsAtom,
  cartTotalAtom,
  type CartItem,
  type CheckoutResponse,
  type Order,
} from "../../atoms/store";
import { isAuthenticatedAtom } from "../../atoms/auth";
import { apiRequest } from "../../utils/api";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import { formatCents } from "../../utils/money";
import OrderSubmittedView from "../../components/store/OrderStatusView";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";
import "../../styles/Cart.css";

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

function LocationPickerEvents({
  setDeliveryLocation,
}: {
  setDeliveryLocation: (loc: string) => void;
}) {
  useMapEvents({
    click(e) {
      setDeliveryLocation(
        `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`,
      );
    },
  });
  return null;
}

export const CartPage = () => {
  const [cartItems, setCartItems] = useAtom(storeCartItemsAtom);
  const products = useAtomValue(productsAtom);
  const cartTotal = useAtomValue(cartTotalAtom);
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);

  const [loading, setLoading] = useState(false);
  const [successOrder, setSuccessOrder] = useState<Order | null>(null);
  const [successCartItems, setSuccessCartItems] = useState<CartItem[]>([]);

  const [paymentMethod, setPaymentMethod] = useState("delivery_cash");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("");
  const [extraInfo, setExtraInfo] = useState("");
  const [rememberBilling, setRememberBilling] = useState(false);
  const [billingInfo, setBillingInfo] = useState("");
  const [referralCode, setReferralCode] = useState("");
  type WalletCard = { id: string; card_name: string; card_number: string };
  const [userCards, setUserCards] = useState<WalletCard[]>([]);

  useEffect(() => {
    if (isAuthenticated) {
      apiRequest<{ cards?: WalletCard[] }>("/store/wallet/cards")
        .then((data) => {
          setUserCards(data.cards || []);
        })
        .catch(() => {});
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      // Load combined saved checkout info if present (preferred), fallback to old keys
      const savedJson = localStorage.getItem("checkoutSaved");
      if (savedJson) {
        try {
          const v = JSON.parse(savedJson);
          if (v.billingInfo) setBillingInfo(v.billingInfo);
          if (v.deliveryLocation) setDeliveryLocation(v.deliveryLocation);
          if (v.guestPhone) setGuestPhone(v.guestPhone);
          if (v.extraInfo) setExtraInfo(v.extraInfo);
          setRememberBilling(true);
        } catch {}
      } else {
        const savedBilling = localStorage.getItem("billingInfo");
        if (savedBilling) {
          setBillingInfo(savedBilling);
          setRememberBilling(true);
          const savedLocation = localStorage.getItem("deliveryLocation");
          if (savedLocation) setDeliveryLocation(savedLocation);
          const savedPhone = localStorage.getItem("guestPhone");
          if (savedPhone) setGuestPhone(savedPhone);
          const savedExtraInfo = localStorage.getItem("extraInfo");
          if (savedExtraInfo) setExtraInfo(savedExtraInfo);
        }
      }
    }
  }, [isAuthenticated]);

  const getProduct = (productId: string) =>
    products.find((p) => p.id === productId);

  const handleRemove = async (productId: string) => {
    setCartItems((prev) => prev.filter((i) => i.product_id !== productId));
    if (isAuthenticated) {
      try {
        await apiRequest("/store/cart/remove", {
          method: "DELETE",
          body: JSON.stringify({ product_id: Number(productId) }),
        });
      } catch {}
    }
  };

  const handleClearCart = async () => {
    setCartItems([]);
    if (isAuthenticated) {
      try {
        await apiRequest("/store/cart", { method: "DELETE" });
      } catch {}
    }
  };

  const handleQuantityChange = async (productId: string, raw: string) => {
    const qty = Number.parseInt(raw, 10);
    if (!Number.isNaN(qty) && qty > 0) {
      setCartItems((prev) =>
        prev.map((i) =>
          i.product_id === productId ? { ...i, quantity: qty } : i,
        ),
      );
      if (isAuthenticated) {
        try {
          await apiRequest("/store/cart/update", {
            method: "PUT",
            body: JSON.stringify({
              product_id: Number(productId),
              quantity: qty,
            }),
          });
        } catch (err) {
          toast.error(
            err instanceof Error
              ? err.message
              : "Could not update cart quantity.",
          );
        }
      }
    }
  };

  const handleCheckout = async () => {
    if (cartItems.length === 0) return;

    if (!isAuthenticated && !guestEmail) {
      toast.error("Guest email is required.");
      return;
    }
    if (!guestPhone) {
      toast.error("Contact phone number is required.");
      return;
    }
    if (!deliveryLocation) {
      toast.error("Delivery location is required.");
      return;
    }

    setLoading(true);
    try {
      const data = await apiRequest<CheckoutResponse>("/store/checkout", {
        method: "POST",
        body: JSON.stringify({
          items: cartItems.map((i: CartItem) => ({
            product_id: Number(i.product_id),
            quantity: i.quantity,
          })),
          payment_method_id: paymentMethod,
          currency: "usd",
          is_guest: !isAuthenticated,
          guest_email: guestEmail,
          guest_phone: guestPhone,
          delivery_location: deliveryLocation,
          delivery_date: deliveryDate,
          delivery_time: deliveryTime,
          extra_info: extraInfo,
          billing_info: billingInfo,
          referral_code: referralCode,
        }),
      });

      // Persist saved checkout info as a single object, explicit: do NOT save deliveryTime
      if (isAuthenticated) {
        if (rememberBilling) {
          const saved = {
            billingInfo,
            deliveryLocation,
            guestPhone,
            extraInfo,
            saved_at: new Date().toISOString(),
          };
          localStorage.setItem("checkoutSaved", JSON.stringify(saved));
        } else {
          localStorage.removeItem("checkoutSaved");
        }
      }

      toast.success("Order placed successfully!");
      setSuccessCartItems([...cartItems]);
      setSuccessOrder(data.order);
      setCartItems([]);
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Checkout failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const savedCheckoutInfo = useMemo(() => {
    if (!billingInfo && !guestPhone && !deliveryLocation) return null;
    return [
      billingInfo || "No billing note saved",
      guestPhone || "No phone saved",
      deliveryLocation || "No location saved",
    ];
  }, [billingInfo, deliveryLocation, guestPhone]);

  const deliveryMarkerPosition = useMemo<[number, number] | null>(() => {
    const [latRaw, lngRaw] = deliveryLocation.split(",");
    const lat = Number.parseFloat(latRaw);
    const lng = Number.parseFloat(lngRaw);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
  }, [deliveryLocation]);

  /* ── Success screen ── */
  if (successOrder) {
    return (
      <OrderSubmittedView
        order={successOrder}
        cartItems={successCartItems}
        onBackLink="/store"
      />
    );
  }

  /* ── Empty cart ── */
  if (cartItems.length === 0) {
    return (
      <div className="cart-page-container">
        <div className="cart-header">
          <h1>
            <ShoppingCart size={28} />
            Shopping Cart
          </h1>
        </div>
        <div className="card card--outlined empty-cart">
          <ShoppingCart size={56} className="empty-cart-icon" />
          <h2>Your cart is empty</h2>
          <p>Add some items to your cart to get started.</p>
          <Link to="/store" className="btn btn-primary">
            Browse Store
          </Link>
        </div>
      </div>
    );
  }

  /* ── Main cart ── */
  return (
    <div className="cart-page-container">
      <div className="cart-header">
        <h1>
          <ShoppingCart size={28} />
          Shopping Cart
        </h1>
      </div>

      <div className="cart-content">
        {/* ── Items ── */}
        <div className="cart-items">
          {cartItems.map((item) => {
            const product = getProduct(item.product_id);
            const displayName = product?.name ?? `Product #${item.product_id}`;
            return (
              <div key={item.product_id} className="card card--store cart-item">
                {product?.image_url && (
                  <img
                    src={product.image_url}
                    alt={displayName}
                    className="cart-item-image"
                  />
                )}
                <div className="cart-item-info">
                  <h3>{displayName}</h3>
                  <p className="cart-item-price">
                    {formatCents(product?.price ?? 0)}
                  </p>
                </div>
                <div className="cart-item-controls">
                  <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) =>
                      handleQuantityChange(item.product_id, e.target.value)
                    }
                  />
                  <button
                    type="button"
                    className="btn btn-danger"
                    title="Remove from cart"
                    onClick={() => handleRemove(item.product_id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}

          <div className="cart-footer-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleClearCart}
              disabled={loading}
            >
              Clear Cart
            </button>
            {cartItems.length < 4 && (
              <Link to="/store" className="btn btn-secondary">
                Continue Shopping
              </Link>
            )}
          </div>
        </div>

        {/* ── Checkout panel ── */}
        <div className="card card--outlined cart-summary">
          <h3>Checkout</h3>

          {/* Guest info */}
          {!isAuthenticated && (
            <div className="cart-summary-section">
              <h4>Guest Information</h4>
              <div className="input-group">
                <Mail size={15} />
                <input
                  type="email"
                  placeholder="Email address"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                />
              </div>
              <p className="cart-help-text">
                <Link to="/login">Sign in</Link> to save your details and earn
                rewards.
              </p>
            </div>
          )}
          {/* Saved checkout info quick card */}
          {isAuthenticated && rememberBilling && (
            <div className="saved-checkout-card card card--outlined">
              <div className="saved-checkout-header">
                <strong>Saved billing information</strong>
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => {
                    const savedJson = localStorage.getItem("checkoutSaved");
                    if (savedJson) {
                      try {
                        const v = JSON.parse(savedJson);
                        if (v.billingInfo) setBillingInfo(v.billingInfo);
                        if (v.deliveryLocation)
                          setDeliveryLocation(v.deliveryLocation);
                        if (v.guestPhone) setGuestPhone(v.guestPhone);
                        if (v.extraInfo) setExtraInfo(v.extraInfo);
                      } catch {}
                    }
                  }}
                >
                  Use
                </button>
              </div>
              {savedCheckoutInfo && (
                <div className="saved-checkout-details">
                  {savedCheckoutInfo.map((line, index) => (
                    <div key={`${index}-${line}`}>{line}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Delivery */}
          <div className="cart-summary-section">
            <h4>Delivery</h4>
            <div className="input-group">
              <Phone size={15} />
              <input
                // use inputMode numeric for better mobile keyboards; still accept + and -
                type="tel"
                inputMode="numeric"
                pattern="[0-9+\-() ]*"
                placeholder="Contact phone number"
                value={guestPhone}
                onChange={(e) => setGuestPhone(e.target.value)}
              />
            </div>

            <div className="cart-map-container">
              <MapContainer
                center={[51.505, -0.09]}
                zoom={13}
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                <LocationPickerEvents
                  setDeliveryLocation={setDeliveryLocation}
                />
                {deliveryMarkerPosition && (
                  <Marker position={deliveryMarkerPosition} />
                )}
              </MapContainer>
            </div>

            <div className="input-group">
              <MapPin size={15} />
              <input
                type="text"
                placeholder="Delivery location (or click map to pin)"
                value={deliveryLocation}
                onChange={(e) => setDeliveryLocation(e.target.value)}
              />
            </div>

            <div className="cart-datetime-row">
              <input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                title="Delivery Date"
              />
              <input
                type="time"
                value={deliveryTime}
                onChange={(e) => setDeliveryTime(e.target.value)}
                title="Delivery Time"
              />
            </div>

            <textarea
              className="cart-textarea"
              placeholder="Extra info — gate code, instructions, etc."
              value={extraInfo}
              onChange={(e) => setExtraInfo(e.target.value)}
            />

            <div className="input-group cart-referral-field">
              <input
                type="text"
                placeholder="Referral code (optional)"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value)}
              />
            </div>
          </div>

          {/* Payment */}
          <div className="cart-summary-section">
            <h4>Payment</h4>
            <select
              className="cart-select"
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
            >
              <option value="delivery_cash">Payment on Delivery (Cash)</option>
              {isAuthenticated && (
                <option value="wallet">Store Wallet Balance</option>
              )}
              {isAuthenticated &&
                userCards.map((card) => (
                  <option key={card.id} value={`card_${card.id}`} disabled>
                    {card.card_name} (•••• {card.card_number.slice(-4)}) —
                    Disabled
                  </option>
                ))}
            </select>

            {isAuthenticated && paymentMethod === "delivery_cash" && (
              <>
                <label className="cart-checkbox-label">
                  <input
                    type="checkbox"
                    checked={rememberBilling}
                    onChange={(e) => setRememberBilling(e.target.checked)}
                  />
                  Remember billing information
                </label>
                {rememberBilling && (
                  <textarea
                    className="cart-textarea"
                    placeholder="Billing details — name, note for driver, etc."
                    value={billingInfo}
                    onChange={(e) => setBillingInfo(e.target.value)}
                  />
                )}
              </>
            )}
          </div>

          <hr className="cart-divider" />

          <div className="cart-total-row">
            <span>Total</span>
            <span>{formatCents(Math.round(cartTotal * 100))}</span>
          </div>

          <button
            type="button"
            className="btn btn-primary cart-submit-btn"
            onClick={handleCheckout}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader size={15} className="spin" />
                Submitting Order…
              </>
            ) : (
              "Submit Order"
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
