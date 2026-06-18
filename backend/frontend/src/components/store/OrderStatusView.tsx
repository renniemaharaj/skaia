import type React from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import { Link } from "react-router-dom";
import "leaflet/dist/leaflet.css";
import { useAtomValue } from "jotai";
import L from "leaflet";
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";
import { AlertTriangle, CheckCircle2, Clock, PackageCheck, XCircle } from "lucide-react";
import { productsAtom } from "../../atoms/store";
import type { CartItem, Order } from "../../atoms/store";
import { useWebSocketSync } from "../../hooks/useWebSocketSync";
import { formatCents } from "../../utils/money";
import { ContentFlatCard } from "../cards/ContentFlatCard";
import UserAvatar from "../user/UserAvatar";

import "../../styles/Cart.css";

type Props = {
  order: Order;
  cartItems?: CartItem[];
  onBackLink?: string;
  onVendorStatusChange?: (orderId: string, status: string) => void;
};

const OrderSubmittedView: React.FC<Props> = ({
  order,
  cartItems,
  onBackLink,
  onVendorStatusChange,
}) => {
  const products = useAtomValue(productsAtom);
  const { subscribe, unsubscribe } = useWebSocketSync();

  useEffect(() => {
    if (!order?.id) return;
    subscribe("order", order.id);
    return () => unsubscribe("order", order.id);
  }, [order?.id, subscribe, unsubscribe]);

  // Ensure marker icon is configured for Leaflet
  try {
    const DefaultIcon = L.icon({
      iconUrl: icon,
      shadowUrl: iconShadow,
      iconAnchor: [12, 41],
    });
    // @ts-ignore
    L.Marker.prototype.options.icon = DefaultIcon;
  } catch (e) {}

  const getProduct = (productId: string | number) =>
    products.find(p => String(p.id) === String(productId));

  // If order.items exists, prefer them (they include price at time of purchase)
  const itemsToRender =
    order.items?.map(it => ({
      product_id: String(it.product_id),
      quantity: it.quantity,
      price: it.price,
    })) ||
    (cartItems || []).map(c => ({
      product_id: String(c.product_id),
      quantity: c.quantity,
      price: getProduct(c.product_id)?.price ?? 0,
    }));

  const status = order.status || "pending";
  // If payment exists and succeeded, treat as paid for the header display.
  const paymentStatus = order.payment?.status;
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
          <h1 style={{ margin: 0, fontSize: "1.4rem", fontWeight: 700 }}>{titleText}</h1>
        </div>

        <Link to={onBackLink ?? "/store"} className="btn">
          Back
        </Link>
      </div>

      <div className="cart-content order-status-content">
        <div className="cart-items">
          <h3 className="order-status-items-title">Items ({itemsToRender.length})</h3>
          {itemsToRender.map(item => {
            const product = getProduct(String(item.product_id));
            const displayName = product?.name ?? `Product #${item.product_id}`;
            return (
              <ContentFlatCard key={item.product_id} className="order-status-item">
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
                  <strong>{formatCents((item.price ?? 0) * item.quantity)}</strong>
                </div>
              </ContentFlatCard>
            );
          })}
        </div>

        <div className="cart-summary order-status-summary">
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
            <h3 style={{ marginBottom: 0, fontSize: "1.15rem", fontWeight: 700 }}>
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
                {order.delivery_date ? new Date(order.delivery_date).toLocaleDateString() : ""}{" "}
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

          {Array.isArray(order.vendors) && order.vendors.length > 0 && (
            <div className="order-vendor-panel">
              <div className="order-vendor-panel__header">
                <span>Vendor Activity</span>
                <strong>{order.vendors.length}</strong>
              </div>
              {order.vendors.map(vendor => {
                const vendorName =
                  vendor.vendor?.display_name || `Vendor #${vendor.vendor_id || "unknown"}`;
                return (
                  <div key={vendor.vendor_id} className="order-vendor-row">
                    <div className="order-vendor-row__identity">
                      <UserAvatar
                        src={vendor.vendor?.avatar_url || undefined}
                        alt={vendorName}
                        size={28}
                        initials={vendorName[0]?.toUpperCase()}
                      />
                      <span>
                        <strong>{vendorName}</strong>
                        <small>
                          {vendor.items} item{vendor.items === 1 ? "" : "s"} ·{" "}
                          {formatCents(vendor.total || 0)}
                        </small>
                      </span>
                    </div>
                    <span className={`order-vendor-status order-vendor-status--${vendor.status}`}>
                      {vendor.status}
                    </span>
                    {onVendorStatusChange && !["completed", "cancelled", "failed"].includes(vendor.status) && (
                      <div className="order-vendor-actions">
                        <button
                          type="button"
                          className="order-vendor-action order-vendor-action--accept"
                          onClick={() => onVendorStatusChange(order.id, "accepted")}
                          title="Accept your part"
                        >
                          <PackageCheck size={14} />
                        </button>
                        <button
                          type="button"
                          className="order-vendor-action order-vendor-action--reject"
                          onClick={() => onVendorStatusChange(order.id, "rejected")}
                          title="Reject your part"
                        >
                          <XCircle size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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
    const parts = s.split(",").map(p => p.trim());
    if (parts.length < 2) return null;
    const lat = Number.parseFloat(parts[0]);
    const lng = Number.parseFloat(parts[1]);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return [lat, lng] as [number, number];
  };

  const parsed = parse(loc);

  return (
    <>
      <button
        type="button"
        className="order-location-preview-trigger"
        onClick={() => {
          const p = parse(loc);
          if (p) {
            setCoords(p);
            setOpen(true);
          }
        }}
        style={{
          cursor: parsed ? "pointer" : "default",
          color: parsed ? "var(--color-primary)" : "var(--text-secondary)",
          textDecoration: parsed ? "underline" : "none",
          padding: 0,
          border: 0,
          background: "transparent",
          font: "inherit",
          textAlign: "right",
        }}
      >
        {loc || "N/A"}
      </button>

      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <button
              type="button"
              aria-label="Close map preview"
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 9998,
                background: "rgba(0,0,0,0.3)",
                border: 0,
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
                <button type="button" className="btn-admin-icon" onClick={() => setOpen(false)}>
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
          document.body
        )}
    </>
  );
};
