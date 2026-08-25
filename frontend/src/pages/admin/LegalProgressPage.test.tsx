import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../utils/api";
import LegalProgressPage from "./LegalProgressPage";

vi.mock("../../utils/api", () => ({ apiRequest: vi.fn() }));
vi.mock("../../components/ui/Prompt", () => ({ customConfirm: vi.fn().mockResolvedValue(true) }));

const policies = [
  {
    id: "privacy_1",
    name: "Privacy notice",
    description: "How personal data is used.",
    page_id: 11,
    page_slug: "legal-privacy-notice-a1b2",
    created_at: "2026-08-25T12:00:00Z",
  },
  {
    id: "refund_1",
    name: "Refund policy",
    description: "Store refund terms.",
    page_id: 12,
    page_slug: "legal-refund-policy-c3d4",
    created_at: "2026-08-25T12:00:00Z",
  },
];

describe("LegalProgressPage", () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it("counts referenced pages with authored content", async () => {
    vi.mocked(apiRequest).mockImplementation(async endpoint => {
      if (endpoint === "/config/legal")
        return { policies, cookie_policy_ids: [], checkout_policy_ids: [] };
      if (String(endpoint).includes("privacy")) {
        return { id: 11, slug: policies[0].page_slug, content: '[{"id":"hero"}]' };
      }
      return { id: 12, slug: policies[1].page_slug, content: "[]" };
    });

    render(
      <MemoryRouter>
        <LegalProgressPage />
      </MemoryRouter>
    );

    expect(screen.getByRole("status")).toHaveTextContent("Checking legal policies");
    await waitFor(() =>
      expect(screen.getByLabelText("1 of 2 policies configured")).toBeInTheDocument()
    );
    expect(screen.getByRole("link", { name: /Privacy notice Configured/ })).toHaveAttribute(
      "href",
      `/page/${policies[0].page_slug}`
    );
    expect(screen.getByRole("link", { name: /Refund policy Needs content/ })).toHaveAttribute(
      "href",
      `/page/${policies[1].page_slug}`
    );
    expect(screen.getByText(/placement acceptance stays a simple browser-local checkbox/i)).toBeInTheDocument();
  });

  it("offers policy creation when none exist", async () => {
    vi.mocked(apiRequest).mockResolvedValue({
      policies: [],
      cookie_policy_ids: [],
      checkout_policy_ids: [],
    });

    render(
      <MemoryRouter>
        <LegalProgressPage />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("No policies yet")).toBeInTheDocument());
    expect(screen.getAllByRole("link", { name: "Add policy" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Add policy" })).toHaveAttribute(
      "href",
      "/form/site/legal/new"
    );
    expect(screen.getByLabelText("0 of 0 policies configured")).toBeInTheDocument();
  });

  it("removes cookie and checkout references before trashing a policy page", async () => {
    const user = userEvent.setup();
    const config = {
      policies: [policies[0]],
      cookie_policy_ids: [policies[0].id],
      checkout_policy_ids: [policies[0].id],
    };
    vi.mocked(apiRequest).mockImplementation(async (endpoint, options) => {
      if (endpoint === "/config/legal" && !options) return config;
      if (endpoint === `/pages/${policies[0].page_slug}`) {
        return {
          id: policies[0].page_id,
          slug: policies[0].page_slug,
          content: "[]",
        };
      }
      return options?.body ? JSON.parse(String(options.body)) : undefined;
    });

    render(
      <MemoryRouter>
        <LegalProgressPage />
      </MemoryRouter>
    );
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        "/config/legal",
        expect.objectContaining({ method: "PUT" })
      )
    );
    const save = vi
      .mocked(apiRequest)
      .mock.calls.find(
        ([endpoint, options]) => endpoint === "/config/legal" && options?.method === "PUT"
      );
    expect(JSON.parse(String(save?.[1]?.body))).toEqual({
      policies: [],
      cookie_policy_ids: [],
      checkout_policy_ids: [],
    });
    expect(apiRequest).toHaveBeenCalledWith(`/pages/${policies[0].page_id}`, { method: "DELETE" });
  });
});
