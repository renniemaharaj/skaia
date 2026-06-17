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
  deliveryApplicable: boolean;
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
  onDeliveryApplicableChange: (value: boolean) => void;
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
  deliveryApplicable,
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
  onDeliveryApplicableChange,
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
    <div className="cart-summary cart-checkout-panel">
      <div className="cart-checkout-card cart-checkout-card--details">
        <h3>Checkout</h3>

        {!isAuthenticated && (
          <div className="cart-summary-section">
            <h4>Guest Information</h4>
            <label className="cart-field">
              <span className="cart-field-label">Email address</span>
              <div className="input-group">
                <Mail size={15} />
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={guestEmail}
                  onChange={(event) => onGuestEmailChange(event.target.value)}
                />
              </div>
            </label>
            <p className="cart-help-text">
              <Link to="/login">Sign in</Link> to save your details and earn
              rewards.
            </p>
          </div>
        )}

        {isAuthenticated && rememberBilling && (
          <SavedCheckoutCard
            details={savedCheckoutInfo}
            onUseSavedCheckout={onUseSavedCheckout}
          />
        )}

        <DeliveryLocationPicker
          deliveryApplicable={deliveryApplicable}
          deliveryDate={deliveryDate}
          deliveryLocation={deliveryLocation}
          deliveryMarkerPosition={deliveryMarkerPosition}
          deliveryTime={deliveryTime}
          extraInfo={extraInfo}
          guestPhone={guestPhone}
          referralCode={referralCode}
          onDeliveryApplicableChange={onDeliveryApplicableChange}
          onDeliveryDateChange={onDeliveryDateChange}
          onDeliveryLocationChange={onDeliveryLocationChange}
          onDeliveryTimeChange={onDeliveryTimeChange}
          onExtraInfoChange={onExtraInfoChange}
          onGuestPhoneChange={onGuestPhoneChange}
          onReferralCodeChange={onReferralCodeChange}
        />

        {isAuthenticated && paymentMethod === "delivery_cash" && (
          <div className="cart-summary-section cart-summary-section--last">
            <h4>Billing</h4>
            <label className="cart-checkbox-label">
              <input
                type="checkbox"
                checked={rememberBilling}
                onChange={(event) =>
                  onRememberBillingChange(event.target.checked)
                }
              />
              Remember billing information
            </label>
            {rememberBilling && (
              <label className="cart-field cart-field--spaced">
                <span className="cart-field-label">Billing note</span>
                <textarea
                  className="cart-textarea"
                  placeholder="Name, note for driver, or billing details"
                  value={billingInfo}
                  onChange={(event) => onBillingInfoChange(event.target.value)}
                />
              </label>
            )}
          </div>
        )}
      </div>

      <div className="cart-checkout-card cart-checkout-card--payment">
        <div className="cart-summary-section cart-summary-section--last">
          <h4>Payment</h4>
          <label className="cart-field">
            <span className="cart-field-label">Payment method</span>
            <select
              className="cart-select"
              value={paymentMethod}
              onChange={(event) => onPaymentMethodChange(event.target.value)}
            >
              <option value="delivery_cash">Payment on Delivery (Cash)</option>
              {isAuthenticated && (
                <option value="wallet">Store Wallet Balance</option>
              )}
              {isAuthenticated &&
                userCards.map((card) => (
                  <option key={card.id} value={`card_${card.id}`} disabled>
                    {card.card_name} (ending in {card.card_number.slice(-4)}) -
                    Disabled
                  </option>
                ))}
            </select>
          </label>
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
    </div>
  );
}
