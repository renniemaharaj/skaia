import { Loader, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import Select, { type SelectOption } from "../../input/Select";
import { formatCents } from "../../../utils/money";
import { BillingInfoCard } from "./BillingInfoCard";
import { DeliveryLocationPicker } from "./DeliveryLocationPicker";

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
}: CheckoutPanelProps) {
  const paymentOptions: SelectOption[] = [
    { value: "delivery_cash", label: "Payment on Delivery (Cash)" },
    ...(isAuthenticated
      ? [{ value: "wallet", label: "Store Wallet Balance" }]
      : []),
    ...(isAuthenticated
      ? userCards.map((card) => ({
          value: `card_${card.id}`,
          label: `${card.card_name} (ending in ${card.card_number.slice(-4)}) - Disabled`,
          disabled: true,
        }))
      : []),
  ];

  return (
    <div className="cart-summary cart-checkout-panel">
      <div className="cart-checkout-card cart-glass-tile cart-checkout-card--details">
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
      </div>

      {isAuthenticated && paymentMethod === "delivery_cash" && (
        <BillingInfoCard
          billingInfo={billingInfo}
          rememberBilling={rememberBilling}
          onBillingInfoChange={onBillingInfoChange}
          onRememberBillingChange={onRememberBillingChange}
        />
      )}

      <div className="cart-checkout-card cart-glass-tile cart-checkout-card--payment">
        <div className="cart-summary-section cart-summary-section--last">
          <h4>Payment</h4>
          <div className="cart-field">
            <Select
              className="cart-select"
              label="Payment method"
              value={paymentMethod}
              options={paymentOptions}
              onChange={(event) => onPaymentMethodChange(event.target.value)}
              block
            />
          </div>
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
