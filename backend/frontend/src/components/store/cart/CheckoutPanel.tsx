import { Loader, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { formatCents } from "../../../utils/money";
import { DeliveryLocationPicker } from "./DeliveryLocationPicker";
import { SavedCheckoutCard } from "./SavedCheckoutCard";

export type WalletCard = {
  id: string;
  card_name: string;
  card_number: string;
};

interface CheckoutPanelProps {
  billingInfo: string;
  cartTotal: number;
  deliveryDate: string;
  deliveryLocation: string;
  deliveryMarkerPosition: [number, number] | null;
  deliveryTime: string;
  extraInfo: string;
  guestEmail: string;
  guestPhone: string;
  isAuthenticated: boolean;
  loading: boolean;
  paymentMethod: string;
  referralCode: string;
  rememberBilling: boolean;
  savedCheckoutInfo: string[] | null;
  userCards: WalletCard[];
  onBillingInfoChange: (value: string) => void;
  onCheckout: () => void;
  onDeliveryDateChange: (value: string) => void;
  onDeliveryLocationChange: (value: string) => void;
  onDeliveryTimeChange: (value: string) => void;
  onExtraInfoChange: (value: string) => void;
  onGuestEmailChange: (value: string) => void;
  onGuestPhoneChange: (value: string) => void;
  onPaymentMethodChange: (value: string) => void;
  onReferralCodeChange: (value: string) => void;
  onRememberBillingChange: (value: boolean) => void;
  onUseSavedCheckout: () => void;
}

export function CheckoutPanel({
  billingInfo,
  cartTotal,
  deliveryDate,
  deliveryLocation,
  deliveryMarkerPosition,
  deliveryTime,
  extraInfo,
  guestEmail,
  guestPhone,
  isAuthenticated,
  loading,
  paymentMethod,
  referralCode,
  rememberBilling,
  savedCheckoutInfo,
  userCards,
  onBillingInfoChange,
  onCheckout,
  onDeliveryDateChange,
  onDeliveryLocationChange,
  onDeliveryTimeChange,
  onExtraInfoChange,
  onGuestEmailChange,
  onGuestPhoneChange,
  onPaymentMethodChange,
  onReferralCodeChange,
  onRememberBillingChange,
  onUseSavedCheckout,
}: CheckoutPanelProps) {
  return (
    <div className="card card--outlined cart-summary">
      <h3>Checkout</h3>

      {!isAuthenticated && (
        <div className="cart-summary-section">
          <h4>Guest Information</h4>
          <div className="input-group">
            <Mail size={15} />
            <input
              type="email"
              placeholder="Email address"
              value={guestEmail}
              onChange={event => onGuestEmailChange(event.target.value)}
            />
          </div>
          <p className="cart-help-text">
            <Link to="/login">Sign in</Link> to save your details and earn rewards.
          </p>
        </div>
      )}

      {isAuthenticated && rememberBilling && (
        <SavedCheckoutCard details={savedCheckoutInfo} onUseSavedCheckout={onUseSavedCheckout} />
      )}

      <DeliveryLocationPicker
        deliveryDate={deliveryDate}
        deliveryLocation={deliveryLocation}
        deliveryMarkerPosition={deliveryMarkerPosition}
        deliveryTime={deliveryTime}
        extraInfo={extraInfo}
        guestPhone={guestPhone}
        referralCode={referralCode}
        onDeliveryDateChange={onDeliveryDateChange}
        onDeliveryLocationChange={onDeliveryLocationChange}
        onDeliveryTimeChange={onDeliveryTimeChange}
        onExtraInfoChange={onExtraInfoChange}
        onGuestPhoneChange={onGuestPhoneChange}
        onReferralCodeChange={onReferralCodeChange}
      />

      <div className="cart-summary-section">
        <h4>Payment</h4>
        <select
          className="cart-select"
          value={paymentMethod}
          onChange={event => onPaymentMethodChange(event.target.value)}
        >
          <option value="delivery_cash">Payment on Delivery (Cash)</option>
          {isAuthenticated && <option value="wallet">Store Wallet Balance</option>}
          {isAuthenticated &&
            userCards.map(card => (
              <option key={card.id} value={`card_${card.id}`} disabled>
                {card.card_name} (ending in {card.card_number.slice(-4)}) - Disabled
              </option>
            ))}
        </select>

        {isAuthenticated && paymentMethod === "delivery_cash" && (
          <>
            <label className="cart-checkbox-label">
              <input
                type="checkbox"
                checked={rememberBilling}
                onChange={event => onRememberBillingChange(event.target.checked)}
              />
              Remember billing information
            </label>
            {rememberBilling && (
              <textarea
                className="cart-textarea"
                placeholder="Billing details - name, note for driver, etc."
                value={billingInfo}
                onChange={event => onBillingInfoChange(event.target.value)}
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
        onClick={onCheckout}
        disabled={loading}
      >
        {loading ? (
          <>
            <Loader size={15} className="spin" />
            Submitting Order...
          </>
        ) : (
          "Submit Order"
        )}
      </button>
    </div>
  );
}
