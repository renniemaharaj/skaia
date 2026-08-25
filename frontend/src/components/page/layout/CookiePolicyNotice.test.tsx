import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../../utils/api";
import { CookiePolicyNotice } from "./CookiePolicyNotice";

vi.mock("../../../utils/api", () => ({ apiRequest: vi.fn() }));

describe("CookiePolicyNotice", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    localStorage.clear();
  });

  it("shows unaccepted cookie policies to every visitor", async () => {
    const user = userEvent.setup();
    vi.mocked(apiRequest).mockResolvedValue({
      policies: [
        {
          id: "cookies",
          name: "Cookie choices",
          page_slug: "legal-cookie-choices-a1b2",
        },
      ],
      cookie_policy_ids: ["cookies"],
      footer_policy_ids: [],
      checkout_policy_ids: [],
    });
    render(
      <MemoryRouter>
        <CookiePolicyNotice />
      </MemoryRouter>
    );

    await waitFor(() =>
      expect(
        screen.getByRole("complementary", { name: "Cookie policies" })
      ).toBeInTheDocument()
    );
    expect(screen.getByRole("link", { name: "Cookie choices" })).toHaveAttribute(
      "href",
      "/page/legal-cookie-choices-a1b2"
    );
    await user.click(screen.getByRole("checkbox"));
    await waitFor(() =>
      expect(screen.queryByRole("complementary", { name: "Cookie policies" })).not.toBeInTheDocument()
    );
    expect(localStorage.getItem("skaia.policy-acceptance.v1")).toContain("cookies");
  });

  it("renders nothing when no cookie policies are selected", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      policies: [],
      cookie_policy_ids: [],
      footer_policy_ids: [],
      checkout_policy_ids: [],
    });
    const { container } = render(
      <MemoryRouter>
        <CookiePolicyNotice />
      </MemoryRouter>
    );
    await waitFor(() => expect(apiRequest).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
