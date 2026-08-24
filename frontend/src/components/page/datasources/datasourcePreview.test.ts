import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../../utils/api";
import { runDatasourcePreview } from "./datasourcePreview";

vi.mock("../../../utils/api", () => ({
  apiRequest: vi.fn(),
}));

describe("runDatasourcePreview", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
  });

  it("sends source and transient env input to the backend sandbox", async () => {
    vi.mocked(apiRequest).mockResolvedValue({ data: [], diagnostics: [] });
    const files = { "main.ts": "return [];" };

    await runDatasourcePreview(files, "TOKEN=secret");

    expect(apiRequest).toHaveBeenCalledWith("/config/datasources/preview", {
      method: "POST",
      body: JSON.stringify({ files, env_data: "TOKEN=secret" }),
    });
  });
});
