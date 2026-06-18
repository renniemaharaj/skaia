import type React from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { toast } from "sonner";
import { isAuthenticatedAtom } from "../../atoms/auth";
import { currentOrderAtom, ordersAtom } from "../../atoms/store";
import type { Order } from "../../atoms/store";
import OrderSubmittedView from "../../components/store/OrderStatusView";
import { useWebSocketSync } from "../../hooks/useWebSocketSync";
import { apiRequest } from "../../utils/api";

type OrderResponse = Order | { order: Order };

const OrderViewPage: React.FC = () => {
  const { id } = useParams();
  const location = useLocation();
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const [order, setOrder] = useAtom(currentOrderAtom);
  const setOrders = useSetAtom(ordersAtom);
  const [loading, setLoading] = useState(false);
  const { subscribe, unsubscribe } = useWebSocketSync();

  useEffect(() => {
    if (!id || !isAuthenticated) return;
    subscribe("order", id);
    return () => unsubscribe("order", id);
  }, [id, isAuthenticated, subscribe, unsubscribe]);

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

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (loading) return <div style={{ padding: "2rem" }}>Loading...</div>;
  if (!order || String(order.id) !== String(id))
    return (
      <div style={{ padding: "2rem" }}>
        Order not found. <Link to="/store/orders">Back to orders</Link>
      </div>
    );

  return <OrderSubmittedView order={order} onBackLink="/store/orders" />;
};

export default OrderViewPage;
