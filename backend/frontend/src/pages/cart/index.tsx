import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ShoppingCart, Trash2, Loader, MapPin, Phone, Mail, CheckCircle2 } from "lucide-react";
import { useAtom, useAtomValue } from "jotai";
import { toast } from "sonner";
import {
  storeCartItemsAtom,
  productsAtom,
  cartTotalAtom,
  type CartItem,
  type Order,
} from "../../atoms/store";
import { isAuthenticatedAtom } from "../../atoms/auth";
import { apiRequest } from "../../utils/api";
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import "../../styles/Cart.css";

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

function LocationPickerEvents({ setDeliveryLocation }: { setDeliveryLocation: (loc: string) => void }) {
  useMapEvents({
    click(e) {
      setDeliveryLocation(`${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`);
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

  // Checkout form state
  const [paymentMethod, setPaymentMethod] = useState("delivery_cash");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("");
  const [extraInfo, setExtraInfo] = useState("");
  const [rememberBilling, setRememberBilling] = useState(false);
  const [billingInfo, setBillingInfo] = useState("");
  const [userCards, setUserCards] = useState<any[]>([]);

  useEffect(() => {
    if (isAuthenticated) {
      apiRequest("/store/wallet/cards")
        .then((data: any) => {
          setUserCards(data.cards || []);
        })
        .catch(() => {});
    }
  }, [isAuthenticated]);

  useEffect(() => {
    // Load remembered billing info if authenticated
    if (isAuthenticated) {
      const saved = localStorage.getItem("billingInfo");
      if (saved) {
        setBillingInfo(saved);
        setRememberBilling(true);
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

  const handleQuantityChange = (productId: string, raw: string) => {
    const qty = parseInt(raw);
    if (!isNaN(qty) && qty > 0) {
      setCartItems((prev) =>
        prev.map((i) =>
          i.product_id === productId ? { ...i, quantity: qty } : i,
        ),
      );
    }
  };

  const handleCheckout = async () => {
    if (cartItems.length === 0) return;
    
    if (!isAuthenticated && (!guestEmail || !guestPhone)) {
      toast.error("Guest email and phone are required.");
      return;
    }
    if (!deliveryLocation) {
      toast.error("Delivery location is required.");
      return;
    }

    setLoading(true);
    try {
      const data = await apiRequest("/store/checkout", {
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
        }),
      }) as any;
      
      if (rememberBilling && isAuthenticated) {
        localStorage.setItem("billingInfo", billingInfo);
      } else if (!rememberBilling && isAuthenticated) {
        localStorage.removeItem("billingInfo");
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

  if (successOrder) {
    return (
      <div className="cart-page-container">
        <div className="card card--store" style={{ padding: "2rem", textAlign: "center" }}>
          <CheckCircle2 size={64} style={{ color: "var(--color-success)", margin: "0 auto 1rem" }} />
          <h2>Order Submitted!</h2>
          <p>Your order ID is <strong>#{successOrder.id}</strong>.</p>
          <div style={{ marginTop: "2rem", textAlign: "left" }}>
            <h3>Order Status: <span style={{ color: "var(--color-primary)", textTransform: "capitalize" }}>{successOrder.status}</span></h3>
            <p>Submitted on: {new Date(successOrder.created_at).toLocaleString()}</p>
            {successOrder.status === "pending" && <p>Estimated time until ready: <strong>Processing...</strong></p>}
            {successOrder.status === "accepted" && <p>Your order is being prepared and will be dispatched soon.</p>}
            
            <h4 style={{ marginTop: "1.5rem" }}>Order Items</h4>
            <div className="cart-items" style={{ marginTop: "1rem" }}>
              {successCartItems.map((item) => {
                const product = getProduct(item.product_id);
                return (
                  <div key={item.product_id} className="card card--outlined" style={{ padding: "1rem", display: "flex", justifyContent: "space-between" }}>
                    <span>{product?.name} x {item.quantity}</span>
                    <span>${((product?.price || 0) * item.quantity).toFixed(2)}</span>
                  </div>
                );
              })}
              <div style={{ marginTop: "1rem", textAlign: "right" }}>
                <strong>Total: ${(successOrder.total_price || 0).toFixed(2)}</strong>
              </div>
            </div>
            
            <div style={{ marginTop: "2rem", display: "flex", gap: "1rem", justifyContent: "center" }}>
              <Link to="/store" className="btn btn-primary">Back to Store</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cart-page-container">
      <div className="cart-header">
        <h1>
          <ShoppingCart size={32} />
          Shopping Cart
        </h1>
      </div>

      {cartItems.length > 0 ? (
        <div className="cart-content">
          <div className="cart-items">
            {cartItems.map((item) => {
              const product = getProduct(item.product_id);
              const displayName = product?.name ?? `Product #${item.product_id}`;
              const displayPrice = product?.price ?? 0;
              return (
                <div key={item.product_id} className="card card--store cart-item">
                  <div className="cart-item-info">
                    <h3>{displayName}</h3>
                    <p>${displayPrice.toFixed(2)}</p>
                  </div>
                  <div className="cart-item-controls">
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => handleQuantityChange(item.product_id, e.target.value)}
                    />
                    <button
                      className="btn btn-secondary"
                      title="Remove from cart"
                      onClick={() => handleRemove(item.product_id)}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              );
            })}
            <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
              <button className="btn btn-secondary" onClick={handleClearCart} disabled={loading} style={{ alignSelf: "flex-start" }}>
                Clear Cart
              </button>
              {cartItems.length < 4 && (
                <Link to="/store" className="btn btn-primary" style={{ alignSelf: "flex-start" }}>
                  Continue Shopping
                </Link>
              )}
            </div>
          </div>

          <div className="card card--outlined cart-summary" style={{ alignSelf: "start", position: "sticky", top: "2rem" }}>
            <h3>Checkout Details</h3>
            
            {!isAuthenticated && (
              <div style={{ marginBottom: "1rem" }}>
                <h4>Guest Information</h4>
                <div className="input-group" style={{ marginBottom: "0.5rem" }}>
                  <Mail size={16} />
                  <input type="email" placeholder="Email" value={guestEmail} onChange={e => setGuestEmail(e.target.value)} />
                </div>
                <div className="input-group">
                  <Phone size={16} />
                  <input type="tel" placeholder="Phone Number" value={guestPhone} onChange={e => setGuestPhone(e.target.value)} />
                </div>
                <p style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}>
                  Or <Link to="/login">sign in</Link> to save your details and earn rewards!
                </p>
              </div>
            )}

            <div style={{ marginBottom: "1rem" }}>
              <h4>Delivery</h4>
              <div style={{ height: "200px", width: "100%", marginBottom: "0.5rem", borderRadius: "var(--radius-md)", overflow: "hidden", border: "1px solid var(--border-color)" }}>
                <MapContainer center={[51.505, -0.09]} zoom={13} style={{ height: "100%", width: "100%" }}>
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  />
                  <LocationPickerEvents setDeliveryLocation={setDeliveryLocation} />
                  {deliveryLocation && deliveryLocation.includes(",") && !isNaN(parseFloat(deliveryLocation.split(",")[0])) && !isNaN(parseFloat(deliveryLocation.split(",")[1])) && (
                    <Marker position={[
                      parseFloat(deliveryLocation.split(",")[0]),
                      parseFloat(deliveryLocation.split(",")[1])
                    ]} />
                  )}
                </MapContainer>
              </div>
              <div className="input-group" style={{ marginBottom: "0.5rem" }}>
                <MapPin size={16} />
                <input type="text" placeholder="Delivery Location (Click map to pin or type address)" value={deliveryLocation} onChange={e => setDeliveryLocation(e.target.value)} />
              </div>
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} style={{ flex: 1 }} title="Delivery Date" />
                <input type="time" value={deliveryTime} onChange={e => setDeliveryTime(e.target.value)} style={{ flex: 1 }} title="Delivery Time" />
              </div>
              <textarea 
                placeholder="Extra Info (Gate code, instructions, etc.)" 
                value={extraInfo} 
                onChange={e => setExtraInfo(e.target.value)}
                style={{ width: "100%", padding: "0.5rem", minHeight: "60px", resize: "vertical", background: "var(--input-bg)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", color: "var(--text-primary)" }}
              />
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <h4>Payment</h4>
              <select 
                value={paymentMethod} 
                onChange={e => setPaymentMethod(e.target.value)}
                style={{ width: "100%", padding: "0.5rem", background: "var(--input-bg)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", color: "var(--text-primary)", marginBottom: "0.5rem" }}
              >
                <option value="delivery_cash">Payment on Delivery (Cash)</option>
                {isAuthenticated && <option value="wallet">Store Wallet Balance</option>}
                {isAuthenticated && userCards.map(card => (
                  <option key={card.id} value={`card_${card.id}`} disabled>
                    {card.card_name} (•••• {card.card_number.slice(-4)}) - Disabled
                  </option>
                ))}
              </select>
              
              {isAuthenticated && paymentMethod === "delivery_cash" && (
                <div style={{ marginTop: "0.5rem" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem", cursor: "pointer" }}>
                    <input type="checkbox" checked={rememberBilling} onChange={e => setRememberBilling(e.target.checked)} />
                    Remember Billing Information
                  </label>
                  {rememberBilling && (
                     <textarea 
                       placeholder="Billing Details (Name, Note for driver, etc.)" 
                       value={billingInfo} 
                       onChange={e => setBillingInfo(e.target.value)}
                       style={{ width: "100%", padding: "0.5rem", marginTop: "0.5rem", minHeight: "60px", resize: "vertical", background: "var(--input-bg)", border: "1px solid var(--border-color)", borderRadius: "var(--radius-md)", color: "var(--text-primary)" }}
                     />
                  )}
                </div>
              )}
            </div>

            <h3 style={{ marginTop: "1.5rem", borderTop: "1px solid var(--border-color)", paddingTop: "1rem" }}>
              Total: ${cartTotal.toFixed(2)}
            </h3>
            
            <button
              className="btn btn-primary"
              onClick={handleCheckout}
              disabled={loading}
              style={{ width: "100%", marginTop: "1rem", padding: "0.75rem", fontSize: "1.1rem" }}
            >
              {loading ? (
                <>
                  <Loader size={16} className="spin" style={{ marginRight: 6 }} />
                  Submitting Order…
                </>
              ) : (
                "Submit Order"
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="card card--outlined empty-cart">
          <ShoppingCart size={64} className="empty-cart-icon" />
          <h2>Your cart is empty</h2>
          <p>Let's add some items to your cart and make your server experience even better!</p>
          <Link to="/store" className="btn btn-primary">
            Continue Shopping
          </Link>
        </div>
      )}
    </div>
  );
};
