import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import LeaderboardsPage from "./LeaderboardsPage";
vi.mock("../../utils/api", () => ({
  apiRequest: vi.fn((path: string) =>
    path === "/rankings/datasets"
      ? Promise.resolve([
          {
            key: "wins",
            name: "Wins",
            description: "",
            metric_label: "wins",
            direction: "desc",
            tie_rule: "competition",
          },
        ])
      : path.endsWith("/seasons")
        ? Promise.resolve([{ key: "current", name: "Current" }])
        : Promise.resolve({
            dataset: { key: "wins", name: "Wins", metric_label: "wins" },
            season: { key: "current", name: "Current" },
            entries: [
              {
                id: 1,
                rank: 1,
                subject_type: "user",
                subject_key: "7",
                display_name: "Ada",
                score: "12",
              },
            ],
          })
  ),
}));
describe("LeaderboardsPage", () => {
  it("renders bounded standings and filters", async () => {
    render(
      <MemoryRouter>
        <LeaderboardsPage />
      </MemoryRouter>
    );
    expect(await screen.findByText("Ada")).toBeInTheDocument();
    expect(screen.getByLabelText("Dataset")).toHaveValue("wins");
    expect(screen.getByText("#1")).toBeInTheDocument();
  });
});
