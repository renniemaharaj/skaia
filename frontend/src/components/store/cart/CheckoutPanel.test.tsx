import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { CheckoutPanel } from "./CheckoutPanel";

const baseProps = {
  billingInfo: "",
  cartTotal: 25,
  deliveryApplicable: false,
  deliveryDate: "",
  deliveryLocation: "",
  deliveryMarkerPosition: null,
  deliveryTime: "",
  extraInfo: "",
  guestEmail: "",
  guestPhone: "8685551234",
  isAuthenticated: true,
  loading: false,
  paymentMethod: "delivery_cash",
  checkoutPolicies: [],
  acceptedPolicyIDs: new Set<string>(),
  checkoutNoticeVariant: "standard" as const,
  checkoutNoticeMessage: "Review every policy.",
  checkoutPolicyCheckboxText: "I agree to {policy}",
  canManageCheckoutPolicies: false,
  referralCode: "",
  rememberBilling: false,
  userCards: [],
  onBillingInfoChange: vi.fn(),
  onCheckout: vi.fn(),
  onDeliveryApplicableChange: vi.fn(),
  onDeliveryDateChange: vi.fn(),
  onDeliveryLocationChange: vi.fn(),
  onDeliveryTimeChange: vi.fn(),
  onExtraInfoChange: vi.fn(),
  onGuestEmailChange: vi.fn(),
  onGuestPhoneChange: vi.fn(),
  onPaymentMethodChange: vi.fn(),
  onReferralCodeChange: vi.fn(),
  onRememberBillingChange: vi.fn(),
  onPolicyAcceptanceChange: vi.fn(),
};

describe("CheckoutPanel policy acceptance", () => {
  it("links to required policies and disables checkout until accepted", () => {
    render(
      <MemoryRouter>
        <CheckoutPanel
          {...baseProps}
          checkoutPolicies={[{ id: "refunds", name: "Refund policy", page_slug: "legal-refunds-a1b2" } as never]}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "Refund policy" })).toHaveAttribute(
      "href",
      "/page/legal-refunds-a1b2"
    );
    expect(screen.getByText("Review every policy.")).toBeInTheDocument();
    expect(screen.getByText(/I agree to/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit Order" })).toBeDisabled();
  });

  it("offers policy editing beside payment controls to store managers", () => {
    render(
      <MemoryRouter>
        <CheckoutPanel {...baseProps} canManageCheckoutPolicies />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "Edit policies" })).toHaveAttribute(
      "href",
      "/form/store/checkout-policies"
    );
  });

  it("enables checkout when every required policy is accepted", () => {
    render(
      <MemoryRouter>
        <CheckoutPanel
          {...baseProps}
          checkoutPolicies={[{ id: "refunds", name: "Refund policy", page_slug: "legal-refunds-a1b2" } as never]}
          acceptedPolicyIDs={new Set(["refunds"])}
        />
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: "Submit Order" })).toBeEnabled();
  });
});
