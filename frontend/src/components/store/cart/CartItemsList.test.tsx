import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { CartItem, Product } from "../../../atoms/store";
import { CartItemsList } from "./CartItemsList";

const product: Product = {
  id: "product-1",
  name: "Field Guide",
  description: "A practical field guide.",
  price: 2500,
  stock: 4,
  stock_unlimited: false,
  category_id: "books",
  image_url: "/products/guide.webp",
  is_active: true,
  created_at: "2026-08-16T12:00:00Z",
  updated_at: "2026-08-16T12:00:00Z",
};

const item: CartItem = {
  id: "cart-1",
  user_id: "user-1",
  product_id: product.id,
  quantity: 1,
  added_at: "2026-08-16T12:00:00Z",
};

describe("CartItemsList media", () => {
  it("keeps quantity and removal controls available after a thumbnail failure", () => {
    const onQuantityChange = vi.fn();
    const onRemove = vi.fn();
    render(
      <MemoryRouter>
        <CartItemsList
          items={[item]}
          products={[product]}
          loading={false}
          onClearCart={vi.fn()}
          onQuantityChange={onQuantityChange}
          onRemove={onRemove}
        />
      </MemoryRouter>
    );

    fireEvent.error(screen.getByRole("img", { name: "Field Guide" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Field Guide");
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "2" } });
    expect(onQuantityChange).toHaveBeenCalledWith(product.id, "2");
    fireEvent.click(screen.getByRole("button", { name: "Remove from cart" }));
    expect(onRemove).toHaveBeenCalledWith(product.id);
  });
});
