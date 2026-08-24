import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import RewardsPage from "./RewardsPage";
vi.mock("../../utils/api", () => ({
  apiRequest: vi.fn((path: string) =>
    path.endsWith("catalog")
      ? Promise.resolve([
          { id: 1, key: "badge", name: "Badge", description: "Profile badge", cost: 5 },
        ])
      : Promise.resolve({ balance: 10, grants: [], redemptions: [] })
  ),
}));
const renderPage = () =>
  render(
    <MemoryRouter>
      <RewardsPage />
    </MemoryRouter>
  );
describe("RewardsPage", () => {
  it("renders balance, catalog and redemption action", async () => {
    renderPage();
    expect(await screen.findByText("10 points available")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Redeem" }));
    await waitFor(() => expect(screen.getByText("Badge")).toBeInTheDocument());
  });
  it("has an explicit empty history state", async () => {
    renderPage();
    expect(await screen.findByText("No reward activity yet.")).toBeInTheDocument();
  });
});
