import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import { accessTokenAtom } from "../../atoms/auth";
import { apiRequest } from "../../utils/api";
import CommunityDetailPage from "./CommunityDetailPage";

vi.mock("../../utils/api", async importOriginal => {
  const actual = await importOriginal<typeof import("../../utils/api")>();
  return { ...actual, apiRequest: vi.fn() };
});

describe("CommunityDetailPage", () => {
  it("renders the linked page in-module and exposes its canonical management routes", async () => {
    vi.mocked(apiRequest).mockResolvedValueOnce({
      id: 4,
      kind: "proposal",
      title: "A better commons",
      summary: "A proposal backed by a real custom page.",
      body: "[]",
      visibility: "private",
      author_name: "Ada",
      page_id: 19,
      page_slug: "community-proposal-better-commons",
      can_manage_page: true,
      canonical_thread_id: 27,
      can_edit_thread: true,
      can_edit: true,
      can_delete: true,
      can_transition: true,
      proposal: { state: "submitted", score: 0 },
    });

    render(
      <MemoryRouter initialEntries={["/community/proposal/4"]}>
        <Routes>
          <Route path="/community/:kind/:id" element={<CommunityDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "A better commons" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View full page" })).toHaveAttribute(
      "href",
      "/page/community-proposal-better-commons"
    );
    expect(screen.getByRole("link", { name: "View full page" })).toHaveClass("action-btn");
    expect(screen.getByRole("link", { name: "Manage page" })).toHaveAttribute(
      "href",
      "/form/page/community-proposal-better-commons/manage"
    );
    expect(screen.getByRole("link", { name: "Edit proposal" })).toHaveAttribute(
      "href",
      "/form/community/proposal/4/edit"
    );
    expect(screen.getByRole("link", { name: "View discussion thread" })).toHaveAttribute(
      "href",
      "/view-thread/27"
    );
    expect(screen.getByRole("link", { name: "Edit discussion thread" })).toHaveAttribute(
      "href",
      "/edit-thread/27"
    );
    expect(screen.getByRole("button", { name: "Delete proposal" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete proposal" })).toHaveClass(
      "action-btn",
      "danger"
    );
    expect(screen.getByRole("radio", { name: "Start review" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in to participate" })).toBeDisabled();
  });

  it("keeps linked-page interactive sections functional inside community detail", async () => {
    const store = createStore();
    store.set(accessTokenAtom, "test-token");
    const interactiveConfig = {
      status: "open",
      submit_label: "Send feedback",
      success_text: "Feedback saved",
      result_visibility: "never",
      response_limit: 0,
      fields: [{ key: "message", type: "textarea", label: "Message", required: true }],
      records: [],
    };
    vi.mocked(apiRequest)
      .mockResolvedValueOnce({
        id: 8,
        kind: "showcase",
        title: "Shared work",
        summary: "A linked page with participation.",
        body: JSON.stringify([
          {
            id: 7,
            display_order: 1,
            section_type: "form",
            heading: "Feedback",
            subheading: "Respond without leaving the showcase.",
            config: JSON.stringify(interactiveConfig),
          },
        ]),
        visibility: "public",
        author_name: "Ada",
        page_id: 19,
        page_slug: "community-showcase-shared-work",
        canonical_thread_id: 28,
        showcase: { media: [], credits: "" },
      })
      .mockResolvedValueOnce({ config: JSON.stringify(interactiveConfig) });

    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={["/community/showcase/8"]}>
          <Routes>
            <Route path="/community/:kind/:id" element={<CommunityDetailPage />} />
          </Routes>
        </MemoryRouter>
      </Provider>
    );

    fireEvent.change(await screen.findByRole("textbox", { name: "Message *" }), {
      target: { value: "Useful work" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenLastCalledWith(
        "/pages/19/sections/7/responses",
        expect.objectContaining({ method: "POST" })
      )
    );
  });
});
