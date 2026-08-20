import { useAtom, useAtomValue, useSetAtom } from "jotai";
import type React from "react";
import { useEffect, useState } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { toast } from "sonner";
import { isAuthenticatedAtom } from "../../atoms/auth";
import { currentOrderAtom, ordersAtom } from "../../atoms/store";
import type { Order } from "../../atoms/store";
import OrderSubmittedView from "../../components/store/OrderStatusView";
import { apiRequest } from "../../utils/api";
import { SkeletonContent, SkeletonPrimitive } from "../ui/Skeleton";
import { StorePageShell } from "./StorePageShell";

type OrderResponse = Order | { order: Order };

const OrderViewPage: React.FC = () => {
  const { id } = useParams();
  const location = useLocation();
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const [order, setOrder] = useAtom(currentOrderAtom);
  const setOrders = useSetAtom(ordersAtom);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id || !isAuthenticated) {
      setOrder(null);
      return;
    }
    setOrder(null);
    setLoading(true);
    apiRequest<OrderResponse>(`/store/orders/${id}`)
      .then(data => {
        const nextOrder = "order" in data ? data.order : data;
        setOrder(nextOrder);
        setOrders(prev => {
          const exists = prev.some(o => String(o.id) === String(nextOrder.id));
          return exists
            ? prev.map(o => (String(o.id) === String(nextOrder.id) ? { ...o, ...nextOrder } : o))
            : [nextOrder, ...prev];
        });
      })
      .catch(() => toast.error("Failed to load order"))
      .finally(() => setLoading(false));
  }, [id, isAuthenticated, setOrder, setOrders]);

  const updateVendorStatus = async (orderId: string, status: string) => {
    try {
      const updated = await apiRequest<Order>(`/store/orders/${orderId}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      setOrder(updated);
      setOrders(prev => {
        const exists = prev.some(o => String(o.id) === String(updated.id));
        return exists
          ? prev.map(o => (String(o.id) === String(updated.id) ? { ...o, ...updated } : o))
          : [updated, ...prev];
      });
      toast.success(status === "accepted" ? "Your part was accepted" : "Your part was updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update order");
    }
  };

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (loading) {
    return (
      <StorePageShell backTo="/store/orders" backLabel="Back to orders" title="Order">
        <SkeletonContent label="Loading order">
          <SkeletonPrimitive shape="heading" width="32%" />
          <SkeletonContent variant="table-row" announce={false} />
          <SkeletonContent variant="table-row" announce={false} />
          <SkeletonPrimitive height={180} />
        </SkeletonContent>
      </StorePageShell>
    );
  }
  if (!order || String(order.id) !== String(id))
    return (
      <StorePageShell backTo="/store/orders" backLabel="Back to orders" title="Order not found" />
    );

  return (
    <OrderSubmittedView
      order={order}
      onBackLink="/store/orders"
      onVendorStatusChange={updateVendorStatus}
    />
  );
};

export default OrderViewPage;
