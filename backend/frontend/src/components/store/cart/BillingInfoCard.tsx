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
      <div className="cart-summary-section cart-summary-section--last">
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
      </div>
		</ContentFlatCard>
  );
}
import { ContentFlatCard } from "../../cards/ContentFlatCard";
