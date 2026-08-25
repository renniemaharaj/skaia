import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../utils/api";
import LegalPolicyFormPage from "./LegalPolicyFormPage";

vi.mock("../../utils/api", () => ({ apiRequest: vi.fn() }));

describe("LegalPolicyFormPage", () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it("creates a public empty custom page and stores its policy reference", async () => {
    const user = userEvent.setup();
    vi.mocked(apiRequest).mockImplementation(async (endpoint, options) => {
      if (endpoint === "/pages" && options?.method === "POST") {
        return {
          id: 44,
          slug: "legal-refund-policy-12345678",
          created_at: "2026-08-25T12:00:00Z",
        };
      }
      if (endpoint === "/config/legal" && !options)
        return { policies: [], cookie_policy_ids: [], checkout_policy_ids: [] };
      if (endpoint === "/config/legal" && options?.method === "PUT")
        return JSON.parse(options.body as string);
      return undefined;
    });

    render(
      <MemoryRouter initialEntries={["/form/site/legal/new"]}>
        <Routes>
          <Route path="/form/site/legal/new" element={<LegalPolicyFormPage />} />
          <Route path="/page/:slug" element={<p>Policy editor</p>} />
        </Routes>
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText("Policy name"), "Refund policy");
    await user.type(screen.getByLabelText("Description"), "Store refund terms");
    await user.click(screen.getByRole("button", { name: "Create policy" }));

    await waitFor(() => expect(screen.getByText("Policy editor")).toBeInTheDocument());
    const createBody = JSON.parse(
      String(vi.mocked(apiRequest).mock.calls.find(([path]) => path === "/pages")?.[1]?.body)
    );
    expect(createBody).toMatchObject({
      title: "Refund policy",
      description: "Store refund terms",
      visibility: "public",
      content: "[]",
    });
    const saveCall = vi
      .mocked(apiRequest)
      .mock.calls.find(([path, options]) => path === "/config/legal" && options?.method === "PUT");
    const saved = JSON.parse(String(saveCall?.[1]?.body));
    expect(saved.policies[0]).toMatchObject({
      name: "Refund policy",
      description: "Store refund terms",
      page_id: 44,
      page_slug: "legal-refund-policy-12345678",
    });
    expect(saved).toMatchObject({ cookie_policy_ids: [], checkout_policy_ids: [] });
    expect(vi.mocked(apiRequest).mock.calls.map(([path]) => path)).toEqual([
      "/pages",
      "/config/legal",
      "/config/legal",
    ]);
  });
});
