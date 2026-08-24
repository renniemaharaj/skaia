import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import { apiRequest } from "../../utils/api";
import CommunityFormPage from "./CommunityFormPage";

vi.mock("../../utils/api", async importOriginal => {
  const actual = await importOriginal<typeof import("../../utils/api")>();
  return { ...actual, apiRequest: vi.fn() };
});

describe("CommunityFormPage", () => {
  it("uses the centered comfortable shell and permission-projected edit endpoint", async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce({
        id: 4,
        kind: "showcase",
        slug: "build-log",
        title: "Build log",
        summary: "Original summary",
        visibility: "public",
        publication_status: "published",
        can_edit: true,
        showcase: { media: ["/uploads/one.jpg"], credits: "Ada" },
      })
      .mockResolvedValueOnce({ id: 4 });

    const { container } = render(
      <MemoryRouter initialEntries={["/form/community/showcase/4/edit"]}>
        <Routes>
          <Route path="/form/community/:kind/:id/edit" element={<CommunityFormPage />} />
          <Route path="/community/:kind/:id" element={<p>Saved publication</p>} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Edit showcase" })).toBeInTheDocument();
    expect(container.querySelector(".module-page-shell--comfortable")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Updated build log" } });
    fireEvent.click(screen.getByRole("button", { name: "Save showcase" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    expect(vi.mocked(apiRequest).mock.calls[1][0]).toBe("/community/showcase/4");
    expect(vi.mocked(apiRequest).mock.calls[1][1]).toMatchObject({ method: "PUT" });
    expect(await screen.findByText("Saved publication")).toBeInTheDocument();
  });

  it("explains that creation provisions an owned page and discussion thread", () => {
    render(
      <MemoryRouter initialEntries={["/form/community/proposal/new"]}>
        <Routes>
          <Route path="/form/community/:kind/new" element={<CommunityFormPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText(/owned custom page and discussion thread/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Discussion thread ID")).not.toBeInTheDocument();
  });
});
