import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../../utils/api";
import type { PageSection } from "../types";
import { ResourceEmbedBlock } from "./ResourceEmbedBlock";

vi.mock("../../../utils/api", async importOriginal => ({
  ...(await importOriginal<typeof import("../../../utils/api")>()),
  apiRequest: vi.fn(),
}));
vi.mock("../../store/ProductPage", () => ({
  ProductPage: ({ productId }: { productId: string }) => <div>Full product route {productId}</div>,
}));
vi.mock("../../forum/thread-view/ViewThreadPage", () => ({
  default: ({ embeddedThreadId, embedded }: { embeddedThreadId: string; embedded: boolean }) => (
    <div data-embedded={embedded}>Full thread route {embeddedThreadId}</div>
  ),
}));
vi.mock("../../../pages/documentation/DocumentationViewPage", () => ({
  default: ({
    embeddedDocumentationSlug,
    embedded,
  }: {
    embeddedDocumentationSlug: string;
    embedded: boolean;
  }) => <div data-embedded={embedded}>Full documentation route {embeddedDocumentationSlug}</div>,
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
  });

  it("mounts the full product route with the referenced identity", () => {
    render(
      <MemoryRouter>
        <ResourceEmbedBlock
          section={section({ resource_type: "product", resource_id: "7" })}
          {...handlers()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Full product route 7")).toBeInTheDocument();
    expect(mockedApi).not.toHaveBeenCalled();
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

  it("mounts full thread and documentation routes with their referenced identities", () => {
    const { rerender } = render(
      <MemoryRouter>
        <ResourceEmbedBlock
          section={section({ resource_type: "forum_thread", resource_id: "12" })}
          {...handlers()}
        />
      </MemoryRouter>
    );
    expect(screen.getByText("Full thread route 12")).toHaveAttribute("data-embedded", "true");

    rerender(
      <MemoryRouter>
        <ResourceEmbedBlock
          section={section({ resource_type: "documentation", resource_id: "handbook" })}
          {...handlers()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Full documentation route handbook")).toHaveAttribute(
      "data-embedded",
      "true"
    );
    expect(mockedApi).not.toHaveBeenCalled();
  });

  it("keeps browse previews inert and free of route mounting or enrichment requests", () => {
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
    expect(screen.queryByText("Full product route 7")).not.toBeInTheDocument();
    expect(mockedApi).not.toHaveBeenCalled();
  });
});
