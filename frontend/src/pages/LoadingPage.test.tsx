import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import LoadingPage, { routeLoadingFamily } from "./LoadingPage";

describe("LoadingPage", () => {
  it("maps route families to their content-shaped shell", () => {
    expect(routeLoadingFamily("/pages")).toBe("page");
    expect(routeLoadingFamily("/")).toBe("page");
    expect(routeLoadingFamily("/store/products/4")).toBe("commerce");
    expect(routeLoadingFamily("/wallet/session")).toBe("commerce");
    expect(routeLoadingFamily("/documentation/guides/2")).toBe("documentation");
    expect(routeLoadingFamily("/kjv/John/3")).toBe("reader");
    expect(routeLoadingFamily("/datasources/4/edit")).toBe("table");
    expect(routeLoadingFamily("/clipmaker")).toBe("canvas");
    expect(routeLoadingFamily("/form/page/home/manage")).toBe("form");
  });

  it("renders one accessible owner with decorative page geometry", () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/pages/example"]}>
        <LoadingPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("status", { name: "Loading page" })).toHaveClass(
      "route-skeleton--page"
    );
    expect(container.querySelector(".route-skeleton__hero")).toBeInTheDocument();
    expect(container.querySelectorAll(".route-skeleton__card")).toHaveLength(3);
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});
