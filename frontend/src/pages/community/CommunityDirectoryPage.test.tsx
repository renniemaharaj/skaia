import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import { apiRequest } from "../../utils/api";
import CommunityDirectoryPage from "./CommunityDirectoryPage";

vi.mock("../../utils/api", () => ({
  apiRequest: vi.fn(() =>
    Promise.resolve({
      items: [
        {
          id: 1,
          kind: "proposal",
          title: "Better search",
          summary: "Improve discovery",
          author_name: "Ada",
          created_at: "2026-08-23T00:00:00Z",
          can_edit: true,
          can_delete: true,
        },
      ],
    })
  ),
}));

describe("CommunityDirectoryPage", () => {
  it("renders canonical links and compact permission-projected actions", async () => {
    render(
      <MemoryRouter initialEntries={["/community/proposal"]}>
        <Routes>
          <Route path="/community/:kind" element={<CommunityDirectoryPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Better search")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Better search/ })).toHaveAttribute(
      "href",
      "/community/proposal/1"
    );
    expect(screen.getAllByRole("link", { name: "Edit proposal" })[0]).toHaveClass("action-btn");
    expect(screen.getAllByRole("button", { name: "Delete proposal" })[0]).toHaveClass(
      "action-btn",
      "danger"
    );
    expect(apiRequest).toHaveBeenCalled();
  });
});
