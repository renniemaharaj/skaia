import React from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { useAtomValue } from "jotai";
import { productsAtom } from "../../atoms/store";
import { formatCents } from "../../utils/money";
import type { Order, CartItem } from "../../atoms/store";

import "../../styles/Cart.css";

type Props = {
  order: Order;
  cartItems?: CartItem[];
  onBackLink?: string;
};

const OrderSubmittedView: React.FC<Props> = ({
  order,
  cartItems,
  onBackLink,
}) => {
  const products = useAtomValue(productsAtom);

  const getProduct = (productId: string) =>
    products.find((p) => p.id === (productId as any));

  // If order.items exists, prefer them (they include price at time of purchase)
  const itemsToRender =
    order.items?.map((it) => ({
      product_id: String(it.product_id),
      quantity: it.quantity,
      price: it.price,
    })) ||
    (cartItems || []).map((c) => ({
      product_id: String(c.product_id),
      quantity: c.quantity,
      price: getProduct(c.product_id as any)?.price ?? 0,
    }));

  const status = order.status || "pending";
  let TitleIcon = Clock;
  let titleText = "Order Submitted";
  if (status === "completed") {
    TitleIcon = CheckCircle2;
    titleText = "Order Completed";
  } else if (status === "paid") {
    TitleIcon = CheckCircle2;
    titleText = "Order Paid";
  } else if (status === "failed") {
    TitleIcon = AlertTriangle;
    titleText = "Order Pending";
  }

  return (
    <div className="cart-page-container">
      <div
        className="cart-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h1>
          <TitleIcon size={28} style={{ verticalAlign: "middle" }} />{" "}
          {titleText}
        </h1>
        <Link to={onBackLink ?? "/store"} className="btn">
          Back
        </Link>
      </div>

      <div className="cart-content">
        <div className="cart-items">
          <h3 style={{ marginBottom: "0.5rem" }}>
            Items ({itemsToRender.length})
          </h3>
          {itemsToRender.map((item) => {
            const product = getProduct(String(item.product_id));
            return (
              <div key={item.product_id} className="card card--store cart-item">
                {product?.image_url && (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="cart-item-image"
                  />
                )}
                <div className="cart-item-info">
                  <h3>{product?.name ?? `Product #${item.product_id}`}</h3>
                  <p className="cart-item-price">
                    {formatCents(item.price ?? 0)}
                  </p>
                </div>
                <div
                  className="cart-item-controls"
                  style={{ flexDirection: "column", alignItems: "flex-end" }}
                >
                  <span
                    style={{
                      fontSize: "0.875rem",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Qty: {item.quantity}
                  </span>
                  <strong style={{ color: "var(--text-primary)" }}>
                    {formatCents((item.price ?? 0) * item.quantity)}
                  </strong>
                </div>
              </div>
            );
          })}
        </div>

        <div className="cart-summary">
          <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
            <h3 style={{ marginBottom: 0 }}>Order #{order.id}</h3>
          </div>

          <div className="cart-success-meta">
            <div className="cart-success-meta-row">
              <span>Status</span>
              <span className="cart-success-status">{order.status}</span>
            </div>
            <div className="cart-success-meta-row">
              <span>Submitted</span>
              <span>{new Date(order.created_at).toLocaleString()}</span>
            </div>
            <div className="cart-success-meta-row">
              <span>Delivery Location</span>
              <span>{order.delivery_location || "N/A"}</span>
            </div>
            <div className="cart-success-meta-row">
              <span>Delivery Time</span>
              <span>
                {order.delivery_date
                  ? new Date(order.delivery_date).toLocaleDateString()
                  : ""}{" "}
                {order.delivery_time || ""}
              </span>
            </div>
            <div className="cart-success-meta-row">
              <span>Billing Info</span>
              <span>{order.billing_info || "N/A"}</span>
            </div>
          </div>

          <hr className="cart-divider" />

          <div className="cart-total-row">
            <span>Total</span>
            <span>{formatCents(order.total_price || 0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderSubmittedView;
