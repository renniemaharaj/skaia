import type { Order, Payment } from "../../atoms/store";

export type OrderWithPayment = Order & { payment?: Payment };
export type OrderSortMode = "newest" | "oldest" | "total-desc" | "total-asc";

export interface OrderFilters {
  search: string;
  status: string;
  payment: string;
  sort: OrderSortMode;
}

export const DEFAULT_ORDER_FILTERS: OrderFilters = {
  search: "",
  status: "all",
  payment: "all",
  sort: "newest",
};

export function filterOrders(
  orders: Order[],
  paymentsByOrder: Record<string, Payment>,
  filters: OrderFilters
) {
  const search = filters.search.trim().toLowerCase();
  return orders
    .filter(order => {
      if (filters.status !== "all" && order.status !== filters.status) return false;
      const paymentStatus = paymentsByOrder[order.id]?.status || "unpaid";
      if (filters.payment !== "all" && paymentStatus !== filters.payment) return false;
      if (!search) return true;
      return [
        order.id,
        order.user_id,
        order.guest_email,
        order.guest_phone,
        order.delivery_location,
        order.status,
        paymentStatus,
      ].some(value =>
        String(value || "")
          .toLowerCase()
          .includes(search)
      );
    })
    .sort((a, b) => {
      switch (filters.sort) {
        case "oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "total-desc":
          return b.total_price - a.total_price;
        case "total-asc":
          return a.total_price - b.total_price;
        case "newest":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
}
