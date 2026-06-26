import { useAtom, useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { isAuthenticatedAtom } from "../../../atoms/auth";
import {
  type CartItem,
  type CheckoutResponse,
  type Order,
  cartTotalAtom,
  productsAtom,
  storeCartItemsAtom,
} from "../../../atoms/store";
import { apiRequest } from "../../../utils/api";
import OrderSubmittedView from "../OrderStatusView";
import { StorePageShell } from "../StorePageShell";
import { CartHeader } from "./CartHeader";
import { CartItemsList } from "./CartItemsList";
import { CheckoutPanel, type WalletCard } from "./CheckoutPanel";
import { EmptyCart } from "./EmptyCart";
import "../../../styles/Cart.css";

type SavedCheckoutInfo = {
  billingInfo: string;
  deliveryLocation: string;
  guestPhone: string;
  extraInfo: string;
};

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
  const [deliveryApplicable, setDeliveryApplicable] = useState(false);
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("");
  const [extraInfo, setExtraInfo] = useState("");
  const [rememberBilling, setRememberBilling] = useState(false);
  const [billingInfo, setBillingInfo] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [userCards, setUserCards] = useState<WalletCard[]>([]);
  const [savedCheckoutBrief, setSavedCheckoutBrief] = useState<SavedCheckoutInfo | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      apiRequest<{ cards?: WalletCard[] }>("/store/wallet/cards")
        .then(data => {
          setUserCards(data.cards || []);
        })
        .catch(() => {});
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setSavedCheckoutBrief(null);
      return;
    }

    if (isAuthenticated) {
      // Load combined saved checkout info if present (preferred), fallback to old keys
      const savedJson = localStorage.getItem("checkoutSaved");
      if (savedJson) {
        try {
          const v = JSON.parse(savedJson);
          const saved = {
            billingInfo: v.billingInfo || "",
            deliveryLocation: v.deliveryLocation || "",
            guestPhone: v.guestPhone || "",
            extraInfo: v.extraInfo || "",
          };
          setSavedCheckoutBrief(saved);
          if (saved.billingInfo) setBillingInfo(saved.billingInfo);
          if (saved.deliveryLocation) setDeliveryLocation(saved.deliveryLocation);
          if (saved.guestPhone) setGuestPhone(saved.guestPhone);
          if (saved.extraInfo) setExtraInfo(saved.extraInfo);
          setRememberBilling(true);
        } catch {}
      } else {
        const savedBilling = localStorage.getItem("billingInfo");
        if (savedBilling) {
          const saved = {
            billingInfo: savedBilling,
            deliveryLocation: localStorage.getItem("deliveryLocation") || "",
            guestPhone: localStorage.getItem("guestPhone") || "",
            extraInfo: localStorage.getItem("extraInfo") || "",
          };
          setSavedCheckoutBrief(saved);
          setBillingInfo(saved.billingInfo);
          setRememberBilling(true);
          if (saved.deliveryLocation) setDeliveryLocation(saved.deliveryLocation);
          if (saved.guestPhone) setGuestPhone(saved.guestPhone);
          if (saved.extraInfo) setExtraInfo(saved.extraInfo);
        }
      }
    }
  }, [isAuthenticated]);

  const handleRemove = async (productId: string) => {
    setCartItems(prev => prev.filter(i => i.product_id !== productId));
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
      setCartItems(prev =>
        prev.map(i => (i.product_id === productId ? { ...i, quantity: qty } : i))
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
          toast.error(err instanceof Error ? err.message : "Could not update cart quantity.");
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
    if (deliveryApplicable && !deliveryLocation) {
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
          delivery_location: deliveryApplicable ? deliveryLocation : "",
          delivery_date: deliveryApplicable ? deliveryDate : "",
          delivery_time: deliveryApplicable ? deliveryTime : "",
          extra_info: deliveryApplicable ? extraInfo : "",
          billing_info: billingInfo,
          referral_code: referralCode,
        }),
      });

      // Persist saved checkout info as a single object, explicit: do NOT save deliveryTime
      if (isAuthenticated) {
        if (rememberBilling) {
          const saved = {
            billingInfo,
            deliveryLocation: deliveryApplicable ? deliveryLocation : "",
            guestPhone,
            extraInfo: deliveryApplicable ? extraInfo : "",
            saved_at: new Date().toISOString(),
          };
          localStorage.setItem("checkoutSaved", JSON.stringify(saved));
          setSavedCheckoutBrief(saved);
        } else {
          localStorage.removeItem("checkoutSaved");
          setSavedCheckoutBrief(null);
        }
      }

      toast.success("Order placed successfully!");
      setSuccessCartItems([...cartItems]);
      setSuccessOrder(data.order);
      setCartItems([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Checkout failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const hasSavedCheckoutBrief = useMemo(() => {
    if (!savedCheckoutBrief) return false;
    const { billingInfo, deliveryLocation, guestPhone } = savedCheckoutBrief;
    return Boolean(billingInfo || guestPhone || deliveryLocation);
  }, [savedCheckoutBrief]);

  const deliveryMarkerPosition = useMemo<[number, number] | null>(() => {
    const [latRaw, lngRaw] = deliveryLocation.split(",");
    const lat = Number.parseFloat(latRaw);
    const lng = Number.parseFloat(lngRaw);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
  }, [deliveryLocation]);

  const handleUseSavedCheckout = () => {
    if (savedCheckoutBrief) {
      setBillingInfo(savedCheckoutBrief.billingInfo);
      setDeliveryLocation(savedCheckoutBrief.deliveryLocation);
      setGuestPhone(savedCheckoutBrief.guestPhone);
      setExtraInfo(savedCheckoutBrief.extraInfo);
    } else {
      const savedJson = localStorage.getItem("checkoutSaved");
      if (savedJson) {
        try {
          const v = JSON.parse(savedJson);
          if (v.billingInfo) setBillingInfo(v.billingInfo);
          if (v.deliveryLocation) setDeliveryLocation(v.deliveryLocation);
          if (v.guestPhone) setGuestPhone(v.guestPhone);
          if (v.extraInfo) setExtraInfo(v.extraInfo);
        } catch {}
      } else {
        const savedBilling = localStorage.getItem("billingInfo");
        if (savedBilling) setBillingInfo(savedBilling);
        const savedLocation = localStorage.getItem("deliveryLocation");
        if (savedLocation) setDeliveryLocation(savedLocation);
        const savedPhone = localStorage.getItem("guestPhone");
        if (savedPhone) setGuestPhone(savedPhone);
        const savedExtraInfo = localStorage.getItem("extraInfo");
        if (savedExtraInfo) setExtraInfo(savedExtraInfo);
      }
    }
    setRememberBilling(true);
  };

  const savedCheckoutMeta =
    isAuthenticated && savedCheckoutBrief && hasSavedCheckoutBrief ? (
      <>
        <span className="cart-shell-meta-item">
          <span className="cart-shell-meta-label">Saved</span>
          <strong>{savedCheckoutBrief.billingInfo || "Billing note"}</strong>
        </span>
        <span className="cart-shell-meta-item">
          <span className="cart-shell-meta-label">Phone</span>
          <strong>{savedCheckoutBrief.guestPhone || "Not set"}</strong>
        </span>
        <span className="cart-shell-meta-item cart-shell-meta-item--location">
          <span className="cart-shell-meta-label">Location</span>
          <strong>{savedCheckoutBrief.deliveryLocation || "Not set"}</strong>
        </span>
        <button
          type="button"
          className="btn btn-ghost cart-shell-apply-btn"
          onClick={handleUseSavedCheckout}
        >
          Apply
        </button>
      </>
    ) : null;

  /* ── Success screen ── */
  if (successOrder) {
    return (
      <OrderSubmittedView order={successOrder} cartItems={successCartItems} onBackLink="/store" />
    );
  }

  /* ── Empty cart ── */
  if (cartItems.length === 0) {
    return (
      <StorePageShell backTo="/store">
        <EmptyCart />
      </StorePageShell>
    );
  }

  /* ── Main cart ── */
  return (
    <StorePageShell className="cart-page-container" backTo="/store" meta={savedCheckoutMeta}>
      <CartHeader />

      <div className="cart-content">
        <CartItemsList
          items={cartItems}
          products={products}
          loading={loading}
          onClearCart={handleClearCart}
          onQuantityChange={handleQuantityChange}
          onRemove={handleRemove}
        />

        <CheckoutPanel
          billingInfo={billingInfo}
          cartTotal={cartTotal}
          deliveryApplicable={deliveryApplicable}
          deliveryDate={deliveryDate}
          deliveryLocation={deliveryLocation}
          deliveryMarkerPosition={deliveryMarkerPosition}
          deliveryTime={deliveryTime}
          extraInfo={extraInfo}
          guestEmail={guestEmail}
          guestPhone={guestPhone}
          isAuthenticated={isAuthenticated}
          loading={loading}
          paymentMethod={paymentMethod}
          referralCode={referralCode}
          rememberBilling={rememberBilling}
          userCards={userCards}
          onBillingInfoChange={setBillingInfo}
          onCheckout={handleCheckout}
          onDeliveryApplicableChange={setDeliveryApplicable}
          onDeliveryDateChange={setDeliveryDate}
          onDeliveryLocationChange={setDeliveryLocation}
          onDeliveryTimeChange={setDeliveryTime}
          onExtraInfoChange={setExtraInfo}
          onGuestEmailChange={setGuestEmail}
          onGuestPhoneChange={setGuestPhone}
          onPaymentMethodChange={setPaymentMethod}
          onReferralCodeChange={setReferralCode}
          onRememberBillingChange={setRememberBilling}
        />
      </div>
    </StorePageShell>
  );
};
