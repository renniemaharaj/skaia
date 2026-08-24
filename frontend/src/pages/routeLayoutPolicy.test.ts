import { describe, expect, it } from "vitest";
import { isApplicationRoute } from "./routeLayoutPolicy";

describe("route layout policy", () => {
  it("keeps ordinary store submodules in the same web layout as orders", () => {
    expect(isApplicationRoute("/store/orders")).toBe(false);
    expect(isApplicationRoute("/store/product/4")).toBe(false);
    expect(isApplicationRoute("/wallet/session-1")).toBe(false);
    expect(isApplicationRoute("/cart")).toBe(false);
    expect(isApplicationRoute("/administration")).toBe(false);
  });

  it("keeps immersive tools and operator surfaces pathname-owned", () => {
    expect(isApplicationRoute("/inbox")).toBe(true);
    expect(isApplicationRoute("/admin/status")).toBe(true);
    expect(isApplicationRoute("/settings/profile")).toBe(true);
    expect(isApplicationRoute("/visualizer")).toBe(true);
    expect(isApplicationRoute("/form/user/7/profile")).toBe(true);
    expect(isApplicationRoute("/form/site/seo")).toBe(true);
  });
});
