import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Order } from "../../atoms/store";
import { apiRequest } from "../../utils/api";
import { FormSelect, ManagedForm } from "../form";

type OrderResponse = Order | { order: Order };

const statusOptions = (current: string) => {
	const labels: Record<string, string> = {
		pending: "Pending",
		vendor_review: "Vendor review",
		accepted: "Accepted",
		paid: "Paid",
		fulfilment_pending: "Fulfilment pending",
		completed: "Completed",
		failed: "Failed",
		cancelled: "Cancelled",
		rejected: "Rejected",
	};
	const transitions: Record<string, string[]> = {
		pending: ["pending", "accepted", "cancelled", "rejected"],
		vendor_review: ["vendor_review", "accepted", "cancelled", "rejected"],
		accepted: ["accepted", "paid", "completed", "cancelled", "rejected"],
		paid: ["paid", "completed"],
		fulfilment_pending: ["fulfilment_pending", "completed", "cancelled"],
	};
	return (transitions[current] || [current]).map(value => ({ value, label: labels[value] || value }));
};

export default function OrderStatusFormPage() {
  const { orderId = "" } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void apiRequest<OrderResponse>(`/store/orders/${orderId}`)
      .then(response => setOrder("order" in response ? response.order : response))
      .catch(cause => setError(cause instanceof Error ? cause.message : "Unable to load order"));
  }, [orderId]);
  if (error)
    return (
      <div className="card" role="alert">
        {error}
      </div>
    );
  if (!order) return <div className="card">Loading order editor...</div>;
  return (
    <ManagedForm
      id="order-status-form"
      title="Update order status"
      eyebrow="Order"
      description={`Order ${order.id}`}
      initialValues={{ status: order.status || "pending" }}
      cancelTo="/store/orders"
      submitLabel="Save order status"
      onSubmit={async (values, helpers) => {
        helpers.setStatus(undefined);
        try {
          await apiRequest(`/store/orders/${order.id}/status`, {
            method: "PUT",
            body: JSON.stringify({ status: values.status }),
          });
          navigate("/store/orders");
        } catch (cause) {
          helpers.setStatus(cause instanceof Error ? cause.message : "Failed to update order");
        }
      }}
    >
      <FormSelect
        name="status"
        label="Order status"
        block
		options={statusOptions(order.status || "pending")}
      />
    </ManagedForm>
  );
}
