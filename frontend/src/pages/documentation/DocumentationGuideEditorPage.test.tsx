import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DocumentationGuideEditorPage from "./DocumentationGuideEditorPage";

const apiRequest = vi.fn();

vi.mock("../../utils/api", () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

vi.mock("../../components/ui/RichTextEditor", () => ({
  default: () => <div data-testid="rich-text-editor" />,
}));

vi.mock("../../hooks/useDirtyNavigationGuard", () => ({
  useDirtyNavigationGuard: vi.fn(),
}));

describe("DocumentationGuideEditorPage", () => {
  beforeEach(() => {
    apiRequest.mockReset();
    apiRequest.mockResolvedValue({
      documentation: {
        id: 1,
        slug: "platform",
        title: "Platform Documentation",
        description: "",
        visibility: "public",
        owner_id: 1,
        revision: 1,
        can_edit: true,
        created_at: "2026-08-17T00:00:00Z",
        updated_at: "2026-08-17T00:00:00Z",
      },
      sections: [],
      articles: [],
    });
  });

  it("uses the shared routed-form surface with header cancel and submit controls", async () => {
    render(
      <MemoryRouter initialEntries={["/doc/manage/platform/guides/new"]}>
        <Routes>
          <Route
            path="/doc/manage/:documentationSlug/guides/new"
            element={<DocumentationGuideEditorPage />}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Create New Guide" })).toBeInTheDocument();
    const form = document.querySelector("#documentation-guide-form");
    expect(form).toHaveClass("modal-form", "compact-form-card");
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/doc/platform");

    const submit = screen.getByRole("button", { name: "Create guide" });
    expect(submit).toHaveAttribute("form", "documentation-guide-form");
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Guide display name"), {
      target: { value: "Install the platform" },
    });
    fireEvent.change(screen.getByLabelText("Guide URL slug"), {
      target: { value: "install-platform" },
    });

    await waitFor(() => expect(submit).toBeEnabled());
    expect(screen.queryByText("Save guide")).not.toBeInTheDocument();
    expect(screen.getByTestId("rich-text-editor")).toBeInTheDocument();
  });
});
