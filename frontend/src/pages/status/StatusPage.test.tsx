import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../utils/api";
import StatusPage from "./StatusPage";

vi.mock("../../utils/api", () => ({ apiRequest: vi.fn() }));

const snapshot = {
  state: "operational",
  components: [
    { name: "database", state: "operational", required: true, checked_at: "2026-08-23T12:00:00Z" },
  ],
  incidents: [],
  updated_at: "2026-08-23T12:00:00Z",
  delayed: false,
};

describe("StatusPage", () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it("renders the public healthy and empty-incident states", async () => {
    vi.mocked(apiRequest).mockResolvedValue(snapshot);
    render(<StatusPage />);
    expect(screen.getByRole("status")).toHaveTextContent("Checking current service health");
    expect(
      await screen.findByRole("heading", { name: "All systems operational" })
    ).toBeInTheDocument();
    expect(screen.getByText("No incidents have been published.")).toBeInTheDocument();
    expect(screen.queryByText(/latency/i)).not.toBeInTheDocument();
  });

  it("publishes an operator incident and refreshes", async () => {
    const user = userEvent.setup();
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce({
        state: "operational",
        components: [],
        updated_at: snapshot.updated_at,
      })
      .mockResolvedValueOnce({ id: 1 })
      .mockResolvedValueOnce(snapshot)
      .mockResolvedValueOnce({
        state: "operational",
        components: [],
        updated_at: snapshot.updated_at,
      });
    render(<StatusPage operator />);
    await screen.findByRole("heading", { name: "Publish an update" });
    await user.type(screen.getByLabelText("Title"), "Database maintenance");
    await user.type(screen.getByLabelText("Summary"), "Brief maintenance window");
    await user.click(screen.getByRole("button", { name: "Publish update" }));
    expect(apiRequest).toHaveBeenCalledWith(
      "/status/incidents",
      expect.objectContaining({ method: "POST" })
    );
  });
});
