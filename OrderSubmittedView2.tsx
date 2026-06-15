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

const OrderSubmittedView: React.FC<Props> = ({ order, cartItems, onBackLink }) => {
  const products = useAtomValue(productsAtom);

  const getProduct = (productId: string) =>
    products.find((p) => p.id === (productId as any));

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
  const paymentStatus = (order as any).payment?.status;
  const effectiveStatus = paymentStatus === "succeeded" ? "paid" : status;

  let TitleIcon = Clock;
  let titleText = "Order Submitted";
  if (effectiveStatus === "completed") { TitleIcon = CheckCircle2; titleText = "Order Completed"; }
  else if (effectiveStatus === "paid")  { TitleIcon = CheckCircle2; titleText = "Order Paid"; }
  else if (effectiveStatus === "failed") { TitleIcon = AlertTriangle; titleText = "Order Failed"; }
  else if (effectiveStatus === "pending") { TitleIcon = Clock; titleText = "Order Pending"; }

  return (
    <div className="cart-page-container">
      <div className="cart-header order-submitted-header">
        <div className="order-submitted-title">
          <div className="order-status-icon-wrap">
            <TitleIcon size={26} />
          </div>
          <h1>{titleText}</h1>
        </div>
        <Link to={onBackLink ?? "/store"} className="btn btn-ghost">
          Back
        </Link>
      </div>

      <div className="cart-content">
        <div className="cart-items">
          <h3 className="cart-items-heading">Items ({itemsToRender.length})</h3>
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
                  <p className="cart-item-price">{formatCents(item.price ?? 0)}</p>
                </div>
                <div className="cart-item-qty-col">
                  <span className="cart-item-qty-label">Qty: {item.quantity}</span>
                  <strong className="cart-item-line-total">
                    {formatCents((item.price ?? 0) * item.quantity)}
                  </strong>
                </div>
              </div>
            );
          })}
        </div>

        <div className="cart-summary">
          <div className="order-submitted-summary-hero">
            <div className="order-status-icon-wrap order-status-icon-wrap--lg">
              <TitleIcon size={22} />
            </div>
            <h3 className="order-submitted-id">Order #{order.id}</h3>
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
                  : ""}
                {order.delivery_time ? ` ${order.delivery_time}` : ""}
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
