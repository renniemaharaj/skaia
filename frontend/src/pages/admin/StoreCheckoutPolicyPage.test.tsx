import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../utils/api";
import StoreCheckoutPolicyPage from "./StoreCheckoutPolicyPage";

vi.mock("../../utils/api", () => ({ apiRequest: vi.fn() }));

const config = {
  policies: [
    {
      id: "refunds",
      name: "Refund policy",
      description: "Refund terms",
      page_id: 42,
      page_slug: "legal-refunds-a1b2",
      created_at: "2026-08-25T12:00:00Z",
    },
  ],
  cookie_policy_ids: [],
  footer_policy_ids: [],
  checkout_policy_ids: [],
  checkout_notice_variant: "standard" as const,
  checkout_notice_message: "Review every policy.",
  checkout_policy_checkbox_text: "I accept {policy}",
};

describe("StoreCheckoutPolicyPage", () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it("saves selected policies and checkout notice presentation", async () => {
    const user = userEvent.setup();
    vi.mocked(apiRequest).mockImplementation(async (path, options) => {
      if (path === "/config/legal/manifest") return config;
      if (path === "/config/legal/checkout" && options?.method === "PUT") {
        const body = JSON.parse(String(options.body));
        return {
          ...config,
          checkout_policy_ids: body.policy_ids,
          checkout_notice_variant: body.notice_variant,
          checkout_notice_message: body.notice_message,
          checkout_policy_checkbox_text: body.checkbox_text,
        };
      }
      return undefined;
    });

    render(
      <MemoryRouter>
        <StoreCheckoutPolicyPage />
      </MemoryRouter>
    );

    await user.click(await screen.findByLabelText("Message style"));
    await user.click(screen.getByRole("menuitem", { name: "Attention" }));
    const message = screen.getByLabelText("Policy message");
    await user.clear(message);
    await user.type(message, "Accept before payment.");
    await user.click(screen.getByRole("checkbox", { name: "Refund policy" }));
    await user.click(screen.getByRole("button", { name: "Save policies" }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        "/config/legal/checkout",
        expect.objectContaining({ method: "PUT" })
      )
    );
    const save = vi
      .mocked(apiRequest)
      .mock.calls.find(([path]) => path === "/config/legal/checkout");
    expect(JSON.parse(String(save?.[1]?.body))).toMatchObject({
      policy_ids: ["refunds"],
      notice_variant: "attention",
      notice_message: "Accept before payment.",
      checkbox_text: "I accept {policy}",
    });
  });
});
