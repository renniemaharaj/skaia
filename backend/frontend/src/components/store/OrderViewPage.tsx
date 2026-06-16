import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiRequest } from "../../utils/api";
import { toast } from "sonner";
import OrderSubmittedView from "../../components/store/OrderStatusView";
import type { Order } from "../../atoms/store";

const OrderViewPage: React.FC = () => {
  const { id } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiRequest(`/store/orders/${id}`)
      .then((data: any) => setOrder(data.order || data))
      .catch(() => toast.error("Failed to load order"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div style={{ padding: "2rem" }}>Loading...</div>;
  if (!order)
    return (
      <div style={{ padding: "2rem" }}>
        Order not found. <Link to="/store/orders">Back to orders</Link>
      </div>
    );

  return <OrderSubmittedView order={order} onBackLink="/store/orders" />;
};

export default OrderViewPage;
