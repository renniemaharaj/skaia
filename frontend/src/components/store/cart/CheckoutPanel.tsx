import { CreditCard, Loader, Mail, Settings, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { ContentFlatCard } from "../../cards/ContentFlatCard";
import { ContentStandOutCard } from "../../cards/ContentStandOutCard";
import { FormSectionIntro } from "../../form";
import Select, { type SelectOption } from "../../ui/Select";
import { MoneyAmount } from "../../ui/MoneyAmount";
import { BillingInfoCard } from "./BillingInfoCard";
import { DeliveryLocationPicker } from "./DeliveryLocationPicker";
import Checkbox from "../../ui/Checkbox";
import type { LegalPolicy } from "../../../types/legal";

export type WalletCard = {
  id: string;
  card_name: string;
  card_number?: string;
  last4?: string;
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
  checkoutPolicies: LegalPolicy[];
  acceptedPolicyIDs: Set<string>;
  checkoutNoticeVariant: "standard" | "info" | "attention";
  checkoutNoticeMessage: string;
  checkoutPolicyCheckboxText: string;
  canManageCheckoutPolicies: boolean;
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
  onPolicyAcceptanceChange: (policyID: string, accepted: boolean) => void;
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
  checkoutPolicies,
  acceptedPolicyIDs,
  checkoutNoticeVariant,
  checkoutNoticeMessage,
  checkoutPolicyCheckboxText,
  canManageCheckoutPolicies,
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
  onPolicyAcceptanceChange,
}: CheckoutPanelProps) {
  const policiesAccepted = checkoutPolicies.every(policy => acceptedPolicyIDs.has(policy.id));
  const paymentOptions: SelectOption[] = [
    { value: "delivery_cash", label: "Payment on Delivery (Cash)" },
    ...(isAuthenticated ? [{ value: "wallet", label: "Store Wallet Balance" }] : []),
    ...(isAuthenticated
      ? userCards.map(card => ({
          value: `card_${card.id}`,
          label: `${card.card_name} (ending in ${card.last4 || card.card_number?.slice(-4) || "XXXX"}) - Disabled`,
          disabled: true,
        }))
      : []),
  ];

  return (
    <div className="cart-summary cart-checkout-panel">
      <ContentFlatCard className="cart-checkout-card cart-glass-tile cart-checkout-card--details">
        <FormSectionIntro
          className="managed-form__section-intro--spaced"
          icon={<CreditCard size={18} />}
          title="Complete Order"
          description="Please enter your delivery details securely."
        />

        {!isAuthenticated && (
          <ContentStandOutCard className="cart-summary-section" emphasis="group">
            <h4>Guest Information</h4>
            <label className="cart-field cart-field--compact">
              <span className="cart-field-label">Email address</span>
              <div className="input-group">
                <Mail size={15} />
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={guestEmail}
                  onChange={event => onGuestEmailChange(event.target.value)}
                />
              </div>
            </label>
            <p className="cart-help-text">
              <Link to="/login">Sign in</Link> to save your details and earn rewards.
            </p>
          </ContentStandOutCard>
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
      </ContentFlatCard>

      {isAuthenticated && paymentMethod === "delivery_cash" && (
        <BillingInfoCard
          billingInfo={billingInfo}
          rememberBilling={rememberBilling}
          onBillingInfoChange={onBillingInfoChange}
          onRememberBillingChange={onRememberBillingChange}
        />
      )}

      <ContentFlatCard className="cart-checkout-card cart-glass-tile cart-checkout-card--payment">
        {canManageCheckoutPolicies && (
          <Link
            className="sk-btn sk-btn--action sk-btn--sm cart-checkout-policy-edit"
            to="/form/store/checkout-policies"
          >
            <Settings size={14} aria-hidden="true" />
            Edit policies
          </Link>
        )}
        <FormSectionIntro
          className="managed-form__section-intro--spaced"
          icon={<ShieldCheck size={18} />}
          title="Payment Method"
          description="All transactions are secure and encrypted."
        />
        <ContentStandOutCard
          className="cart-summary-section cart-summary-section--last"
          emphasis="group"
        >
          <div className="cart-field">
            <Select
              className="cart-select"
              label="Payment method"
              value={paymentMethod}
              options={paymentOptions}
              onChange={event => onPaymentMethodChange(event.target.value)}
              block
            />
          </div>
        </ContentStandOutCard>

        {checkoutPolicies.length > 0 && (
          <section
            className={`cart-checkout-policies cart-checkout-policies--${checkoutNoticeVariant}`}
            aria-labelledby="checkout-policy-heading"
          >
            <h4 id="checkout-policy-heading">Required store policies</h4>
            <p>{checkoutNoticeMessage}</p>
            <div className="cart-checkout-policies__choices">
              {checkoutPolicies.map(policy => (
                <Checkbox
                  key={policy.id}
                  checked={acceptedPolicyIDs.has(policy.id)}
                  label={policyCheckboxLabel(
                    checkoutPolicyCheckboxText,
                    policy.name,
                    policy.page_slug
                  )}
                  onChange={event => onPolicyAcceptanceChange(policy.id, event.target.checked)}
                />
              ))}
            </div>
          </section>
        )}

        <hr className="cart-divider" />

        <div className="cart-total-row">
          <span>Total</span>
          <MoneyAmount cents={Math.round(cartTotal * 100)} />
        </div>

        <button
          type="button"
          className="btn btn-primary cart-submit-btn"
          onClick={onCheckout}
          disabled={loading || !policiesAccepted}
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
      </ContentFlatCard>
    </div>
  );
}

function policyCheckboxLabel(template: string, policyName: string, pageSlug: string) {
  const marker = "{policy}";
  const markerIndex = template.indexOf(marker);
  const policyLink = <Link to={`/page/${pageSlug}`}>{policyName}</Link>;
  if (markerIndex < 0) {
    return (
      <>
        {template} ({policyLink})
      </>
    );
  }
  return (
    <>
      {template.slice(0, markerIndex)}
      {policyLink}
      {template.slice(markerIndex + marker.length)}
    </>
  );
}
