import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PageBuilderDoc } from "../../hooks/usePageData";
import PageManagePanel from "./PageManagePanel";

const page: PageBuilderDoc = {
  id: 7,
  slug: "about",
  title: "About us",
  description: "About the community",
  seo_title: "",
  seo_description: "",
  seo_image: "",
  content: "[]",
  visibility: "public",
  view_count: 0,
  likes: 0,
  is_liked: false,
  comment_count: 0,
  created_at: "2026-08-18T00:00:00Z",
  updated_at: "2026-08-18T00:00:00Z",
};

describe("PageManagePanel", () => {
  it("uses the header check as the SEO confirmation action", async () => {
    const onSaveSEO = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <PageManagePanel
        page={page}
        owner={null}
        editors={[]}
        onSaveSEO={onSaveSEO}
        onOwnershipUpdate={vi.fn()}
        onClose={onClose}
      />
    );

    const confirm = screen.getByRole("button", { name: "Save page SEO" });
    expect(confirm).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save SEO" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Upload social image")).toHaveAttribute("type", "file");

    fireEvent.change(screen.getByPlaceholderText("About us"), {
      target: { value: "About our writers" },
    });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await waitFor(() => {
      expect(onSaveSEO).toHaveBeenCalledWith({
        seo_title: "About our writers",
        seo_description: "",
        seo_image: "",
      });
      expect(onClose).toHaveBeenCalledOnce();
    });
  });
});
