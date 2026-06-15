import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAtomValue } from "jotai";
import { isAuthenticatedAtom, hasPermissionAtom } from "../../atoms/auth";
import { socketAtom } from "../../atoms/auth";
import { apiRequest } from "../../utils/api";
import { formatCents } from "../../utils/money";
import {
  Loader,
  CheckCircle,
  Trash2,
  ChevronDown,
  ChevronUp,
  MapPin,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import type { Order } from "../../atoms/store";
import "../../styles/Cart.css";

import { DirectoryLayout } from "../page/layout/templates/DirectoryLayout";
import UserProfileOverlay from "../../components/user/UserProfileOverlay";
import UserAvatar from "../../components/user/UserAvatar";
import { useNavigate } from "react-router-dom";
import OrderSubmittedView from "../../components/store/OrderStatusView";
// reuse global table styles from TableView for consistent scrolling
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

export const OrdersPage = () => {
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const isStoreAdmin = useAtomValue(hasPermissionAtom)("store.manageOrders");
  // products atom not needed here; Order view reads product info itself
  const navigate = useNavigate();

  const [orders, setOrders] = useState<Order[]>([]);
  const [paymentsByOrder, setPaymentsByOrder] = useState<Record<string, any>>(
    {},
  );
  const [loading, setLoading] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [mapPopover, setMapPopover] = useState<{
    loc: string;
    x: number;
    y: number;
  } | null>(null);
  const socket = useAtomValue(socketAtom);
  const FOCUS_KEY = "orderFocusId";

  useEffect(() => {
    if (!isAuthenticated && !loading) {
      navigate("/store", { replace: true });
      return;
    }
    if (isAuthenticated) {
      fetchOrders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isStoreAdmin, navigate]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const url = isStoreAdmin ? "/store/orders?all=true" : "/store/orders";
      const data = (await apiRequest(url)) as any;
      const ordersArr = data || [];
      setOrders(ordersArr);

      // If a one-time focus id exists in localStorage, expand that order
      try {
        const focus = localStorage.getItem(FOCUS_KEY);
        if (focus) {
          const found = (ordersArr || []).find(
            (o: any) => String(o.id) === String(focus),
          );
          if (found) setExpandedOrders(new Set([String(focus)]));
          localStorage.removeItem(FOCUS_KEY);
        }
      } catch {}

      // payments may be embedded in the orders response under `payment`
      const map: Record<string, any> = {};
      (ordersArr || []).forEach((o: any) => {
        if (o && o.payment) map[String(o.id)] = o.payment;
      });
      setPaymentsByOrder(map);

      // subscribe to order updates
      try {
        const ws = socket;
        if (ws && ws.readyState === WebSocket.OPEN) {
          (ordersArr || []).forEach((o: any) => {
            try {
              ws.send(
                JSON.stringify({
                  type: "subscribe",
                  payload: { resource_type: "order", resource_id: o.id },
                }),
              );
            } catch {}
          });
        }
      } catch {}
    } catch (err) {
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (id: string, status: string) => {
    try {
      await apiRequest(`/store/orders/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      toast.success("Order status updated");
      fetchOrders();
    } catch (err) {
      toast.error("Failed to update status");
    }
  };

  const deleteOrder = async (id: string) => {
    if (!confirm("Are you sure you want to delete this order?")) return;
    try {
      await apiRequest(`/store/orders/${id}`, { method: "DELETE" });
      toast.success("Order deleted");
      fetchOrders();
    } catch (err) {
      toast.error("Failed to delete order");
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedOrders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  if (!isAuthenticated) return null;

  return (
    <>
      <DirectoryLayout
        title="Store Orders"
        subtitle="Manage your past and current orders."
        items={orders}
        viewMode="list"
        renderGridCard={() => null}
        customListContent={
          <div className="directory-layout__list">
            <div>
              {loading && <Loader className="spin" />}
              {!loading && orders.length === 0 && (
                <p
                  style={{
                    padding: "2rem 0",
                    textAlign: "center",
                    color: "var(--text-secondary)",
                  }}
                >
                  No orders found.
                </p>
              )}
              {!loading && orders.length > 0 && (
                <div className="table-view" style={{ maxWidth: "100%" }}>
                  <table
                    className="orders-table"
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      textAlign: "left",
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          borderBottom: "2px solid var(--border-color)",
                        }}
                      >
                        <th style={{ padding: "1rem", width: "40px" }}></th>
                        <th style={{ padding: "1rem" }}>Order ID</th>
                        <th style={{ padding: "1rem" }}>Date</th>
                        <th style={{ padding: "1rem" }}>Total</th>
                        <th style={{ padding: "1rem" }}>Status</th>
                        {isStoreAdmin && (
                          <th style={{ padding: "1rem" }}>User</th>
                        )}
                        {isStoreAdmin && (
                          <th style={{ padding: "1rem" }}>Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => {
                        const isExpanded = expandedOrders.has(order.id);
                        return (
                          <React.Fragment key={order.id}>
                            <tr
                              style={{
                                borderBottom: isExpanded
                                  ? "none"
                                  : "1px solid var(--border-color)",
                                cursor: "pointer",
                                transition: "background 0.2s",
                              }}
                              onClick={() =>
                                navigate(`/store/orders/${order.id}`)
                              }
                              className="order-row-hover"
                            >
                              <td
                                style={{
                                  padding: "1rem",
                                  color: "var(--text-secondary)",
                                }}
                              >
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleExpand(order.id);
                                  }}
                                >
                                  {isExpanded ? (
                                    <ChevronUp size={18} />
                                  ) : (
                                    <ChevronDown size={18} />
                                  )}
                                </span>
                              </td>
                              <td
                                style={{ padding: "1rem", fontWeight: "600" }}
                              >
                                #{order.id}
                              </td>
                              <td style={{ padding: "1rem" }}>
                                {new Date(
                                  order.created_at,
                                ).toLocaleDateString()}
                              </td>
                              <td style={{ padding: "1rem" }}>
                                {formatCents(order.total_price || 0)}
                              </td>
                              <td style={{ padding: "1rem" }}>
                                <div
                                  style={{
                                    display: "flex",
                                    gap: "0.5rem",
                                    alignItems: "center",
                                  }}
                                >
                                  <span
                                    style={{
                                      textTransform: "capitalize",
                                      color:
                                        order.status === "completed"
                                          ? "var(--color-success)"
                                          : order.status === "failed" ||
                                              order.status === "cancelled"
                                            ? "var(--color-danger)"
                                            : "var(--color-primary)",
                                      fontWeight: "600",
                                    }}
                                  >
                                    {order.status}
                                  </span>
                                  {paymentsByOrder[order.id] && (
                                    <span
                                      style={{
                                        fontSize: "0.85rem",
                                        padding: "0.25rem 0.5rem",
                                        borderRadius: "6px",
                                        background: "var(--bg-secondary)",
                                        color:
                                          paymentsByOrder[order.id].status ===
                                          "succeeded"
                                            ? "var(--color-success)"
                                            : paymentsByOrder[order.id]
                                                  .status === "failed"
                                              ? "var(--color-danger)"
                                              : "var(--text-secondary)",
                                        fontWeight: 600,
                                      }}
                                    >
                                      {paymentsByOrder[order.id].status ===
                                      "succeeded"
                                        ? "Paid"
                                        : paymentsByOrder[order.id].status}
                                    </span>
                                  )}
                                </div>
                              </td>
                              {isStoreAdmin && (
                                <td
                                  style={{ padding: "0.5rem 1rem" }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {order.is_guest ? (
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                      }}
                                    >
                                      <div
                                        className="guest-avatar"
                                        style={{
                                          width: 32,
                                          height: 32,
                                          borderRadius: "50%",
                                          background: "var(--bg-secondary)",
                                          display: "flex",
                                          alignItems: "center",
                                          justifyContent: "center",
                                          fontSize: "0.8rem",
                                          color: "var(--text-secondary)",
                                        }}
                                      >
                                        G
                                      </div>
                                      <span style={{ fontSize: "0.9rem" }}>
                                        Guest
                                      </span>
                                    </div>
                                  ) : order.user_id ? (
                                    <UserProfileOverlay userId={order.user_id}>
                                      <div
                                        style={{
                                          display: "flex",
                                          alignItems: "center",
                                          gap: "8px",
                                        }}
                                      >
                                        <UserAvatar
                                          src={undefined}
                                          initials={`U${order.user_id}`}
                                          size={32}
                                        />
                                        <span style={{ fontSize: "0.9rem" }}>
                                          User #{order.user_id}
                                        </span>
                                      </div>
                                    </UserProfileOverlay>
                                  ) : (
                                    <span>Unknown</span>
                                  )}
                                </td>
                              )}
                              {isStoreAdmin && (
                                <td
                                  className="order-actions"
                                  style={{
                                    padding: "1rem",
                                    display: "flex",
                                    gap: "0.5rem",
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {order.status === "pending" && (
                                    <button
                                      className="action-btn edit-btn"
                                      onClick={() =>
                                        updateOrderStatus(order.id, "accepted")
                                      }
                                      title="Accept Order"
                                    >
                                      <CheckCircle size={16} />
                                    </button>
                                  )}
                                  <button
                                    className={`action-btn ${
                                      order.status === "completed"
                                        ? "active"
                                        : ""
                                    }`}
                                    onClick={() =>
                                      updateOrderStatus(
                                        order.id,
                                        order.status === "completed"
                                          ? "pending"
                                          : "completed",
                                      )
                                    }
                                    title={
                                      order.status === "completed"
                                        ? "Mark Pending"
                                        : "Mark Completed"
                                    }
                                  >
                                    {order.status === "completed" ? (
                                      <RotateCcw size={16} />
                                    ) : (
                                      <CheckCircle size={16} />
                                    )}
                                  </button>
                                  <button
                                    className="action-btn danger"
                                    onClick={() => deleteOrder(order.id)}
                                    title="Delete Order"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </td>
                              )}
                            </tr>

                            {isExpanded && (
                              <tr>
                                <td
                                  colSpan={isStoreAdmin ? 7 : 5}
                                  style={{ padding: 0 }}
                                >
                                  <OrderSubmittedView
                                    order={order}
                                    onBackLink="/store/orders"
                                  />
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        }
      />

      {mapPopover &&
        document.body &&
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
              }}
              onClick={() => setMapPopover(null)}
            />
            <div
              className="glass-menu-wrap"
              style={{
                position: "fixed",
                left: Math.min(mapPopover.x, window.innerWidth - 300),
                top: Math.min(mapPopover.y, window.innerHeight - 250),
                zIndex: 9999,
                width: "300px",
                height: "250px",
                padding: "0.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0 4px",
                }}
              >
                <span style={{ fontSize: "0.9rem", fontWeight: "600" }}>
                  <MapPin
                    size={14}
                    style={{
                      display: "inline",
                      verticalAlign: "middle",
                      marginRight: 4,
                    }}
                  />{" "}
                  Location
                </span>
                <button
                  className="btn-admin-icon"
                  onClick={() => setMapPopover(null)}
                  style={{ padding: "2px 6px" }}
                >
                  &times;
                </button>
              </div>
              <div
                style={{
                  flex: 1,
                  borderRadius: "6px",
                  overflow: "hidden",
                  border: "1px solid var(--border-color)",
                }}
              >
                {(() => {
                  const parts = mapPopover.loc.split(",");
                  if (parts.length >= 2) {
                    const lat = parseFloat(parts[0]);
                    const lng = parseFloat(parts[1]);
                    if (!isNaN(lat) && !isNaN(lng)) {
                      return (
                        <MapContainer
                          center={[lat, lng]}
                          zoom={15}
                          style={{ height: "100%", width: "100%" }}
                          zoomControl={true}
                          dragging={false}
                          scrollWheelZoom={true}
                        >
                          <TileLayer
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution="&copy; OpenStreetMap"
                          />
                          <Marker position={[lat, lng]} />
                        </MapContainer>
                      );
                    }
                  }
                  return (
                    <div
                      style={{
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--text-secondary)",
                        fontSize: "0.9rem",
                      }}
                    >
                      Invalid Coordinates
                    </div>
                  );
                })()}
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
};

export default OrdersPage;
