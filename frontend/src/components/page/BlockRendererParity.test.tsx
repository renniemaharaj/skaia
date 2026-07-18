import { render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BlockRenderer } from "./BlockRenderer";
import { configForNewSection } from "./interactiveTypes";
import type { PageItem, PageSection } from "./types";

const { apiRequestMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn() }));

vi.mock("../../utils/api", async importOriginal => ({
  ...(await importOriginal<typeof import("../../utils/api")>()),
  apiRequest: apiRequestMock,
}));

const callbacks = {
  onUpdateSection: vi.fn(),
  onDeleteSection: vi.fn(),
  onCreateSection: vi.fn(),
  onCreateItem: vi.fn(),
  onUpdateItem: vi.fn(),
  onDeleteItem: vi.fn(),
  onMoveSection: vi.fn(),
};

const section = (
  sectionType: string,
  heading: string,
  config = "{}",
  items: PageItem[] = []
): PageSection => ({
  id: 1,
  display_order: 1,
  section_type: sectionType,
  heading,
  subheading: "Fixture subheading",
  config,
  items,
});

const renderViewerSection = (value: PageSection) =>
  render(<BlockRenderer sections={[value]} canEdit={false} {...callbacks} />);

describe("BlockRenderer family parity", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
  });

  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValue([]);
  });

  it("preserves the simple item-block heading and item hierarchy", async () => {
    renderViewerSection(
      section("feature_grid", "Fixture features", "{}", [
        {
          id: 2,
          section_id: 1,
          display_order: 1,
          icon: "Star",
          heading: "Fixture feature",
          subheading: "Feature detail",
          image_url: "",
          link_url: "",
          config: "{}",
        },
      ])
    );

    expect(await screen.findByRole("heading", { name: "Fixture features" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Fixture feature" })).toBeInTheDocument();
    expect(screen.getByText("Feature detail")).toBeInTheDocument();
  });

  it("preserves the media-block outer surface and authored heading", async () => {
    const { container } = renderViewerSection(
      section("hero", "Fixture hero", '{"variant":1,"background_image":"/fixture.webp"}')
    );

    expect(await screen.findByRole("heading", { name: "Fixture hero" })).toBeInTheDocument();
    expect(container.querySelector("section.hero-banner.hero-v1")).toBeInTheDocument();
    expect(container.querySelector('img[src="/fixture.webp"]')).toBeInTheDocument();
  });

  it("preserves the datasource family empty state without requiring saved data", async () => {
    const { container } = renderViewerSection(section("derived_section", "Fixture data"));

    expect(
      await screen.findByText("No data source configured.", {}, { timeout: 3000 })
    ).toBeInTheDocument();
    expect(container.querySelector("section.derived-section-block")).toBeInTheDocument();
    expect(apiRequestMock).toHaveBeenCalledWith("/config/datasources");
    expect(apiRequestMock).toHaveBeenCalledWith("/config/components");
  });

  it("preserves the interactive family heading, participation tab, and action", async () => {
    const { container } = renderViewerSection(
      section("poll", "Fixture poll", configForNewSection("poll"))
    );

    expect(await screen.findByRole("heading", { name: "Fixture poll" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Participate" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("button", { name: "Sign in to participate" })).toBeDisabled();
    expect(container.querySelector("section.interactive-section")).toBeInTheDocument();
  });
});
