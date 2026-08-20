import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../../utils/api";
import type { PageSection } from "../types";
import { ResourceEmbedBlock } from "./ResourceEmbedBlock";

const { subscribeMock, unsubscribeMock } = vi.hoisted(() => ({
  subscribeMock: vi.fn(),
  unsubscribeMock: vi.fn(),
}));

vi.mock("../../../utils/api", async importOriginal => ({
  ...(await importOriginal<typeof import("../../../utils/api")>()),
  apiRequest: vi.fn(),
}));
vi.mock("../../../hooks/useWebSocketSync", () => ({
  useWebSocketSync: () => ({ subscribe: subscribeMock, unsubscribe: unsubscribeMock }),
}));

const mockedApi = vi.mocked(apiRequest);
const handlers = (onUpdate = vi.fn()) => ({
  canEdit: false,
  onUpdate,
  onDelete: vi.fn(),
  onItemCreate: vi.fn(),
  onItemUpdate: vi.fn(),
  onItemDelete: vi.fn(),
});

function section(config: Record<string, string>): PageSection {
  return {
    id: 1,
    display_order: 1,
    section_type: "resource_embed",
    heading: "",
    subheading: "",
    config: JSON.stringify(config),
    items: [],
  };
}

describe("ResourceEmbedBlock", () => {
  beforeEach(() => {
    mockedApi.mockReset();
    subscribeMock.mockReset();
    unsubscribeMock.mockReset();
  });

  it("loads a referenced product without copying product data into section config", async () => {
    mockedApi.mockResolvedValue({
      id: "7",
      name: "Field Guide",
      description: "Practical notes",
      price: 2500,
      stock: 3,
      stock_unlimited: false,
      category_id: "1",
      is_active: true,
      created_at: "2026-08-20T00:00:00Z",
      updated_at: "2026-08-20T00:00:00Z",
      image_url: "/guide.webp",
    });
    render(
      <MemoryRouter>
        <ResourceEmbedBlock
          section={section({ resource_type: "product", resource_id: "7" })}
          {...handlers()}
        />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Field Guide" })).toBeInTheDocument();
    expect(mockedApi).toHaveBeenCalledWith(
      "/store/products/7",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(screen.getByRole("link", { name: /Open product/ })).toHaveAttribute(
      "href",
      "/store/product/7"
    );
    expect(subscribeMock).toHaveBeenCalledWith("store_product", 7);
  });

  it("uses bounded public picker reads and persists only the selected thread id", async () => {
    const onUpdate = vi.fn();
    mockedApi.mockImplementation(async endpoint => {
      if (!endpoint) return [] as never;
      if (endpoint === "/forum/threads?limit=100")
        return { threads: [{ id: 12, title: "Release notes" }] } as never;
      throw new Error(`Unexpected ${endpoint}`);
    });
    const { container, rerender } = render(
      <MemoryRouter>
        <ResourceEmbedBlock section={section({})} {...handlers(onUpdate)} canEdit />
      </MemoryRouter>
    );

    fireEvent.change(container.querySelectorAll("select")[0], {
      target: { value: "forum_thread" },
    });
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ config: '{"resource_type":"forum_thread"}' })
    );

    rerender(
      <MemoryRouter>
        <ResourceEmbedBlock
          section={section({ resource_type: "forum_thread" })}
          {...handlers(onUpdate)}
          canEdit
        />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(container.querySelector("select option[value='12']")).toBeInTheDocument()
    );
    fireEvent.change(container.querySelectorAll("select")[1], { target: { value: "12" } });
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        config: '{"resource_type":"forum_thread","resource_id":"12"}',
      })
    );
  });

  it("renders a selected documentation resource", async () => {
    mockedApi.mockImplementation(async endpoint => {
      if (!endpoint) return [] as never;
      if (endpoint === "/docs/handbook")
        return {
          documentation: {
            id: 3,
            slug: "handbook",
            title: "Handbook",
            description: "",
            visibility: "public",
          },
          sections: [],
          articles: [{ id: 4, slug: "start", title: "Start here" }],
        } as never;
      throw new Error(`Unexpected ${endpoint}`);
    });
    render(
      <MemoryRouter>
        <ResourceEmbedBlock
          section={section({
            resource_type: "documentation",
            resource_id: "handbook",
          })}
          {...handlers()}
        />
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Handbook" })).toBeInTheDocument();
    expect(screen.getByText("Start here")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open documentation/ })).toHaveAttribute(
      "href",
      "/doc/handbook"
    );
    expect(subscribeMock).toHaveBeenCalledWith("documentation", 3);
  });

  it("keeps browse previews inert and free of resource enrichment requests", () => {
    render(
      <MemoryRouter>
        <ResourceEmbedBlock
          section={section({ resource_type: "product", resource_id: "7" })}
          {...handlers()}
          preview
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Open the page to view this live resource.")).toBeInTheDocument();
    expect(mockedApi).not.toHaveBeenCalled();
    expect(subscribeMock).not.toHaveBeenCalled();
  });
});
