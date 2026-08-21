import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Product, StoreCategory } from "../../atoms/store";
import { apiRequest } from "../../utils/api";
import { EditProductForm } from "./EditProductForm";

vi.mock("../../utils/api", () => ({ apiRequest: vi.fn() }));

const product: Product = {
  id: "42",
  category_id: "7",
  name: "Writer Platform",
  description: "A writing platform",
  price: 10000,
  stock: 10,
  stock_unlimited: false,
  is_active: true,
  created_at: "2026-08-21T00:00:00Z",
  updated_at: "2026-08-21T00:00:00Z",
};

const categories: StoreCategory[] = [
  {
    id: "7",
    name: "Software",
    created_at: "2026-08-21T00:00:00Z",
  },
];

describe("EditProductForm", () => {
  it("renders as routed page content instead of a modal or portal", async () => {
    vi.mocked(apiRequest).mockResolvedValue([]);

    const { container } = render(
      <MemoryRouter>
        <EditProductForm product={product} categories={categories} cancelTo="/store/product/42" />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Edit Product" })).toBeInTheDocument();
    expect(container.querySelector("#edit-product-form")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.querySelector(".managed-form-overlay")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute(
      "href",
      "/store/product/42"
    );
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith("/users/roles"));
  });
});
