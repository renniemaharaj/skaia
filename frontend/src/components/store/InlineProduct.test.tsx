import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Product } from "../../atoms/store";
import { InlineProduct } from "./InlineProduct";

vi.mock("./ratings", () => ({
  useProductRatings: () => ({ averageRating: 0, reviewCount: 0 }),
}));

const product: Product = {
  id: "product-1",
  name: "Field Guide",
  description: "A practical field guide.",
  price: 2500,
  stock: 4,
  stock_unlimited: false,
  category_id: "books",
  is_active: true,
  created_at: "2026-08-16T12:00:00Z",
  updated_at: "2026-08-16T12:00:00Z",
  media: [
    {
      url: "/products/guide.webp",
      filename: "Guide cover",
      mime_type: "image/webp",
      type: "image",
      size: 1024,
      created_at: "2026-08-16T12:00:00Z",
    },
  ],
};

describe("InlineProduct media", () => {
  it("keeps preview and cart actions available when the cover fails", () => {
    const onAddToCart = vi.fn();
    const onImagePreview = vi.fn();
    render(
      <MemoryRouter>
        <InlineProduct
          product={product}
          onAddToCart={onAddToCart}
          onImagePreview={onImagePreview}
        />
      </MemoryRouter>
    );

    fireEvent.error(screen.getByRole("img", { name: "Field Guide" }));
    const failure = screen.getByRole("alert");
    expect(failure).toHaveTextContent("Asset failed to load");
    fireEvent.click(failure);
    expect(onImagePreview).toHaveBeenCalledWith(product, 0);

    fireEvent.click(screen.getByRole("button", { name: "Add to Cart" }));
    expect(onAddToCart).toHaveBeenCalledWith(product);
  });
});
