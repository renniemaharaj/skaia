import React, { useState } from "react";
import { Link } from "react-router-dom";
import { createPortal } from "react-dom";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";
import { CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { useAtomValue } from "jotai";
import { productsAtom } from "../../atoms/store";
import { formatCents } from "../../utils/money";
import type { Order, CartItem } from "../../atoms/store";
import { ContentFlatCard } from "../cards/ContentFlatCard";

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

  // Ensure marker icon is configured for Leaflet
  try {
    const DefaultIcon = L.icon({
      iconUrl: icon as any,
      shadowUrl: iconShadow as any,
      iconAnchor: [12, 41],
    });
    // @ts-ignore
    L.Marker.prototype.options.icon = DefaultIcon;
  } catch (e) {}

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
  // If payment exists and succeeded, treat as paid for the header display.
  const paymentStatus = (order as any).payment?.status;
  const effectiveStatus = paymentStatus === "succeeded" ? "paid" : status;

  let TitleIcon = Clock;
  let titleText = "Order Submitted";
  if (effectiveStatus === "completed") {
    TitleIcon = CheckCircle2;
    titleText = "Order Completed";
  } else if (effectiveStatus === "paid") {
    TitleIcon = CheckCircle2;
    titleText = "Order Paid";
  } else if (effectiveStatus === "failed") {
    TitleIcon = AlertTriangle;
    titleText = "Order Failed";
  } else if (effectiveStatus === "pending") {
    TitleIcon = Clock;
    titleText = "Order Pending";
  }

  return (
    <div className="cart-page-container order-status-view">
      <div
        className="cart-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--bg-secondary)",
              marginBottom: 0,
            }}
          >
            <TitleIcon size={24} />
          </div>
          <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700 }}>
            {titleText}
          </h1>
        </div>

        <Link to={onBackLink ?? "/store"} className="btn">
          Back
        </Link>
      </div>

      <div className="cart-content order-status-content">
        <div className="cart-items">
          <h3 className="order-status-items-title">
            Items ({itemsToRender.length})
          </h3>
          {itemsToRender.map((item) => {
            const product = getProduct(String(item.product_id));
            const displayName = product?.name ?? `Product #${item.product_id}`;
            return (
              <ContentFlatCard
                key={item.product_id}
                className="order-status-item"
              >
                <div className="order-status-item-media">
                  {product?.image_url ? (
                    <img src={product.image_url} alt={displayName} />
                  ) : (
                    <span>{displayName.slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <div className="order-status-item-info">
                  <h3>{displayName}</h3>
                  <span>{formatCents(item.price ?? 0)} each</span>
                </div>
                <div className="order-status-item-total">
                  <span>Qty {item.quantity}</span>
                  <strong>
                    {formatCents((item.price ?? 0) * item.quantity)}
                  </strong>
                </div>
              </ContentFlatCard>
            );
          })}
        </div>

        <div className="cart-summary">
          <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 10,
                margin: "0 auto 6px",
                background: "var(--bg-secondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <TitleIcon size={32} />
            </div>
            <h3
              style={{ marginBottom: 0, fontSize: "1.15rem", fontWeight: 700 }}
            >
              Order #{order.id}
            </h3>
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
              <DeliveryLocationCell loc={order.delivery_location} />
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

// Interactive delivery location cell (opens a read-only map modal)
const DeliveryLocationCell: React.FC<{ loc?: string | null }> = ({ loc }) => {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<[number, number] | null>(null);

  const parse = (s?: string | null) => {
    if (!s) return null;
    const parts = s.split(",").map((p) => p.trim());
    if (parts.length < 2) return null;
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return [lat, lng] as [number, number];
  };

  const parsed = parse(loc);

  return (
    <>
      <span
        role="button"
        tabIndex={0}
        onClick={() => {
          const p = parse(loc);
          if (p) {
            setCoords(p);
            setOpen(true);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const p = parse(loc);
            if (p) {
              setCoords(p);
              setOpen(true);
            }
          }
        }}
        style={{
          cursor: parsed ? "pointer" : "default",
          color: parsed ? "var(--color-primary)" : "var(--text-secondary)",
          textDecoration: parsed ? "underline" : "none",
        }}
      >
        {loc || "N/A"}
      </span>

      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 9998,
                background: "rgba(0,0,0,0.3)",
              }}
              onClick={() => setOpen(false)}
            />
            <div
              className="glass-menu-wrap"
              style={{
                position: "fixed",
                left: "50%",
                top: "50%",
                transform: "translate(-50%, -50%)",
                zIndex: 9999,
                width: "min(90vw, 600px)",
                height: "min(70vh, 480px)",
                padding: "0.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  className="btn-admin-icon"
                  onClick={() => setOpen(false)}
                >
                  ×
                </button>
              </div>
              <div style={{ flex: 1, borderRadius: 8, overflow: "hidden" }}>
                <MapContainer
                  center={coords}
                  zoom={15}
                  style={{ height: "100%", width: "100%" }}
                  dragging={false}
                  doubleClickZoom={false}
                  scrollWheelZoom={false}
                  touchZoom={false}
                  keyboard={false}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution="&copy; OpenStreetMap"
                  />
                  <Marker position={coords} />
                </MapContainer>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
};
