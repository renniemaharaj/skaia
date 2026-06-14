import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAtomValue } from "jotai";
import { isAuthenticatedAtom, hasPermissionAtom } from "../../atoms/auth";
import { apiRequest } from "../../utils/api";
import { Loader, CheckCircle, Trash2, ChevronDown, ChevronUp, Package, MapPin } from "lucide-react";
import { toast } from "sonner";
import type { Order } from "../../atoms/store";
import { productsAtom } from "../../atoms/store";
import "../../styles/Cart.css";

import { DirectoryLayout } from "../page/layout/templates/DirectoryLayout";
import UserProfileOverlay from "../../components/user/UserProfileOverlay";
import UserAvatar from "../../components/user/UserAvatar";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

export const OrdersPage = () => {
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const isStoreAdmin = useAtomValue(hasPermissionAtom)("store.manageOrders");
  const products = useAtomValue(productsAtom);
  const navigate = useNavigate();
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [mapPopover, setMapPopover] = useState<{ loc: string, x: number, y: number } | null>(null);

  useEffect(() => {
    if (!isAuthenticated && !loading) {
      navigate("/store", { replace: true });
      return;
    }
    if (isAuthenticated) {
      fetchOrders();
    }
  }, [isAuthenticated, isStoreAdmin, navigate]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const url = isStoreAdmin ? "/store/orders?all=true" : "/store/orders";
      const data = await apiRequest(url) as any;
      setOrders(data || []);
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
        body: JSON.stringify({ status })
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
      await apiRequest(`/store/orders/${id}`, {
        method: "DELETE"
      });
      toast.success("Order deleted");
      fetchOrders();
    } catch (err) {
      toast.error("Failed to delete order");
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedOrders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  if (!isAuthenticated) {
    return null; // will redirect
  }

  return (
    <>
    <DirectoryLayout
      title="Store Orders"
      subtitle="Manage your past and current orders."
      items={orders}
      viewMode="list"
      renderGridCard={() => null} // Not used since viewMode is list
      customListContent={
        <div className="directory-layout__list">
          <div>
            {loading && <Loader className="spin" />}
            {!loading && orders.length === 0 && <p style={{ padding: "2rem 0", textAlign: "center", color: "var(--text-secondary)" }}>No orders found.</p>}
            {!loading && orders.length > 0 && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border-color)" }}>
                      <th style={{ padding: "1rem", width: "40px" }}></th>
                      <th style={{ padding: "1rem" }}>Order ID</th>
                      <th style={{ padding: "1rem" }}>Date</th>
                      <th style={{ padding: "1rem" }}>Total</th>
                      <th style={{ padding: "1rem" }}>Status</th>
                      {isStoreAdmin && <th style={{ padding: "1rem" }}>User</th>}
                      {isStoreAdmin && <th style={{ padding: "1rem" }}>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(order => {
                      const isExpanded = expandedOrders.has(order.id);
                      return (
                        <React.Fragment key={order.id}>
                          <tr style={{ borderBottom: isExpanded ? "none" : "1px solid var(--border-color)", cursor: "pointer", transition: "background 0.2s" }} onClick={() => toggleExpand(order.id)} className="order-row-hover">
                            <td style={{ padding: "1rem", color: "var(--text-secondary)" }}>
                              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                            </td>
                            <td style={{ padding: "1rem", fontWeight: "600" }}>#{order.id}</td>
                            <td style={{ padding: "1rem" }}>{new Date(order.created_at).toLocaleDateString()}</td>
                            <td style={{ padding: "1rem" }}>${(order.total_price / 100).toFixed(2)}</td>
                            <td style={{ padding: "1rem" }}>
                              <span style={{ 
                                textTransform: "capitalize", 
                                color: order.status === 'completed' ? 'var(--color-success)' : order.status === 'failed' || order.status === 'cancelled' ? 'var(--color-danger)' : 'var(--color-primary)',
                                fontWeight: "600"
                              }}>
                                {order.status}
                              </span>
                            </td>
                            {isStoreAdmin && (
                              <td style={{ padding: "0.5rem 1rem" }} onClick={e => e.stopPropagation()}>
                                {order.is_guest ? (
                                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <div className="guest-avatar" style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--bg-secondary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.8rem", color: "var(--text-secondary)" }}>G</div>
                                    <span style={{ fontSize: "0.9rem" }}>Guest</span>
                                  </div>
                                ) : (
                                  order.user_id ? (
                                    <UserProfileOverlay userId={order.user_id}>
                                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                        <UserAvatar src={undefined} initials={`U${order.user_id}`} size={32} />
                                        <span style={{ fontSize: "0.9rem" }}>User #{order.user_id}</span>
                                      </div>
                                    </UserProfileOverlay>
                                  ) : <span>Unknown</span>
                                )}
                              </td>
                            )}
                            {isStoreAdmin && (
                              <td style={{ padding: "1rem", display: "flex", gap: "0.5rem" }} onClick={e => e.stopPropagation()}>
                                {order.status === 'pending' && (
                                  <button className="btn btn-secondary btn-sm" onClick={() => updateOrderStatus(order.id, 'accepted')} title="Accept Order">
                                    <CheckCircle size={16} />
                                  </button>
                                )}
                                {(order.status === 'pending' || order.status === 'accepted') && (
                                  <button className="btn btn-primary btn-sm" onClick={() => updateOrderStatus(order.id, 'completed')} title="Mark Completed">
                                    <CheckCircle size={16} />
                                  </button>
                                )}
                                <button className="btn btn-secondary btn-sm" style={{ color: "var(--color-danger)", borderColor: "var(--color-danger)" }} onClick={() => deleteOrder(order.id)} title="Delete Order">
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            )}
                          </tr>
                          {isExpanded && (
                            <tr style={{ borderBottom: "1px solid var(--border-color)", background: "var(--bg-secondary)", opacity: 0.95 }}>
                              <td colSpan={isStoreAdmin ? 7 : 5} style={{ padding: "0" }}>
                                <div style={{ padding: "1.5rem 2rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
                                  
                                  <div className="order-expanded-details">
                                    <h4 style={{ marginBottom: "1rem", fontSize: "1rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.5rem" }}>Order Details</h4>
                                    {order.is_guest && (
                                      <div style={{ marginBottom: "1rem", fontSize: "0.9rem" }}>
                                        <p style={{ margin: "4px 0" }}><strong>Guest Email:</strong> {order.guest_email}</p>
                                        <p style={{ margin: "4px 0" }}><strong>Guest Phone:</strong> {order.guest_phone}</p>
                                      </div>
                                    )}
                                    <div style={{ marginBottom: "1rem", fontSize: "0.9rem" }}>
                                      <p style={{ margin: "4px 0", display: "flex", alignItems: "center", gap: "6px" }}>
                                        <strong>Delivery Location:</strong> 
                                        {order.delivery_location ? (
                                          <span 
                                            style={{ color: "var(--color-primary)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px" }}
                                            onClick={(e) => {
                                              if (mapPopover?.loc === order.delivery_location) {
                                                setMapPopover(null);
                                              } else {
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                setMapPopover({ loc: order.delivery_location || "", x: rect.left, y: rect.bottom + 8 });
                                              }
                                            }}
                                          >
                                            <MapPin size={14} />
                                            {order.delivery_location}
                                          </span>
                                        ) : "N/A"}
                                      </p>
                                      {(order.delivery_date || order.delivery_time) && (
                                        <p style={{ margin: "4px 0" }}><strong>Delivery Time:</strong> {order.delivery_date ? new Date(order.delivery_date).toLocaleDateString() : ""} {order.delivery_time}</p>
                                      )}
                                      <p style={{ margin: "4px 0" }}><strong>Billing Info:</strong> {order.billing_info || "N/A"}</p>
                                      {order.extra_info && <p style={{ margin: "4px 0" }}><strong>Extra Info:</strong> {order.extra_info}</p>}
                                    </div>
                                  </div>

                                  <div className="order-expanded-items">
                                    <h4 style={{ marginBottom: "1rem", fontSize: "1rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.5rem" }}>Items ({order.items?.length || 0})</h4>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                                      {order.items?.map(item => {
                                        const product = products.find(p => p.id === item.product_id.toString());
                                        return (
                                          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "1rem", padding: "0.5rem", background: "var(--bg-primary)", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                                            <div style={{ width: 40, height: 40, borderRadius: "6px", overflow: "hidden", background: "var(--bg-secondary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                              {product?.image_url ? (
                                                <img src={product.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                              ) : (
                                                <Package size={20} color="var(--text-secondary)" />
                                              )}
                                            </div>
                                            <div style={{ flex: 1 }}>
                                              <p style={{ margin: 0, fontWeight: "600", fontSize: "0.9rem" }}>{product?.name || `Product #${item.product_id}`}</p>
                                              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)" }}>Qty: {item.quantity}</p>
                                            </div>
                                            <div style={{ fontWeight: "600", fontSize: "0.95rem" }}>
                                              ${(item.price / 100).toFixed(2)}
                                            </div>
                                          </div>
                                        );
                                      })}
                                      {(!order.items || order.items.length === 0) && (
                                        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>No items found for this order.</p>
                                      )}
                                    </div>
                                    <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
                                      <span>Total</span>
                                      <span>${(order.total_price / 100).toFixed(2)}</span>
                                    </div>
                                  </div>
                                </div>
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
    {mapPopover && document.body && createPortal(
      <>
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9998 }} onClick={() => setMapPopover(null)} />
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
            gap: "0.5rem"
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 4px" }}>
            <span style={{ fontSize: "0.9rem", fontWeight: "600" }}><MapPin size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} /> Location</span>
            <button className="btn-admin-icon" onClick={() => setMapPopover(null)} style={{ padding: "2px 6px" }}>&times;</button>
          </div>
          <div style={{ flex: 1, borderRadius: "6px", overflow: "hidden", border: "1px solid var(--border-color)" }}>
            {(() => {
              const parts = mapPopover.loc.split(",");
              if (parts.length >= 2) {
                const lat = parseFloat(parts[0]);
                const lng = parseFloat(parts[1]);
                if (!isNaN(lat) && !isNaN(lng)) {
                  return (
                    <MapContainer center={[lat, lng]} zoom={15} style={{ height: "100%", width: "100%" }} zoomControl={true} dragging={false} scrollWheelZoom={true}>
                      <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution='&copy; OpenStreetMap'
                      />
                      <Marker position={[lat, lng]} />
                    </MapContainer>
                  );
                }
              }
              return <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: "0.9rem" }}>Invalid Coordinates</div>;
            })()}
          </div>
        </div>
      </>,
      document.body
    )}
    </>
  );
};
