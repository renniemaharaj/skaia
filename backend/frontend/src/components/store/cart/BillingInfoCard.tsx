interface BillingInfoCardProps {
  billingInfo: string;
  rememberBilling: boolean;
  onBillingInfoChange: (value: string) => void;
  onRememberBillingChange: (value: boolean) => void;
}

export function BillingInfoCard({
  billingInfo,
  rememberBilling,
  onBillingInfoChange,
  onRememberBillingChange,
}: BillingInfoCardProps) {
  return (
		<ContentFlatCard className="cart-checkout-card cart-glass-tile cart-billing-card">
      <ContentStandOutCard
        className="cart-summary-section cart-summary-section--last"
        emphasis="group"
      >
        <h4>Billing</h4>
        <label className="cart-checkbox-label">
          <input
            type="checkbox"
            checked={rememberBilling}
						onChange={(event) => onRememberBillingChange(event.target.checked)}
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
      </ContentStandOutCard>
		</ContentFlatCard>
  );
}
import { ContentFlatCard } from "../../cards/ContentFlatCard";
import { ContentStandOutCard } from "../../cards/ContentStandOutCard";
