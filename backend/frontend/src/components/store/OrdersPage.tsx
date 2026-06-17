import { useAtomValue } from "jotai";
import {
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Loader,
  MapPin,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MapContainer, Marker, TileLayer } from "react-leaflet";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  hasPermissionAtom,
  isAuthenticatedAtom,
  socketAtom,
} from "../../atoms/auth";
import type { User } from "../../atoms/auth";
import type { Order, Payment, ReferenceCode } from "../../atoms/store";
import OrderSubmittedView from "../../components/store/OrderStatusView";
import PersonPicker from "../../components/ui/PersonPicker";
import {
  type TableColumn,
  TableView,
} from "../../components/ui/TableView/TableView";
import UserAvatar from "../../components/user/UserAvatar";
import UserProfileOverlay from "../../components/user/UserProfileOverlay";
import { apiRequest } from "../../utils/api";
import { formatCents } from "../../utils/money";
import { DirectoryLayout } from "../../components/page/layout/templates/DirectoryLayout";
import { StorePageShell } from "./StorePageShell";
import "../../styles/Cart.css";
import "./OrdersPage.css";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

type OrderWithPayment = Order & { payment?: Payment };

export const OrdersPage = () => {
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const isStoreAdmin = useAtomValue(hasPermissionAtom)("store.manageOrders");
  // products atom not needed here; Order view reads product info itself
  const navigate = useNavigate();

  const [orders, setOrders] = useState<Order[]>([]);
  const [referenceCodes, setReferenceCodes] = useState<ReferenceCode[]>([]);
  const [referenceForm, setReferenceForm] = useState({
    code: "",
    user_id: "",
    incentive_amount: "",
    is_active: true,
  });
  const [editingReferenceCodeId, setEditingReferenceCodeId] = useState<
    string | null
  >(null);
  const [selectedReferenceUser, setSelectedReferenceUser] =
    useState<User | null>(null);
  const [paymentsByOrder, setPaymentsByOrder] = useState<
    Record<string, Payment>
  >({});
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
      if (isStoreAdmin) fetchReferenceCodes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isStoreAdmin, navigate]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const url = isStoreAdmin ? "/store/orders?all=true" : "/store/orders";
      const data = await apiRequest<OrderWithPayment[]>(url);
      const ordersArr = data || [];
      setOrders(ordersArr);

      // If a one-time focus id exists in localStorage, expand that order
      try {
        const focus = localStorage.getItem(FOCUS_KEY);
        if (focus) {
          const found = ordersArr.find(
            (order) => String(order.id) === String(focus),
          );
          if (found) setExpandedOrders(new Set([String(focus)]));
          localStorage.removeItem(FOCUS_KEY);
        }
      } catch {}

      // payments may be embedded in the orders response under `payment`
      const map: Record<string, Payment> = {};
      for (const order of ordersArr) {
        if (order.payment) map[String(order.id)] = order.payment;
      }
      setPaymentsByOrder(map);

      // subscribe to order updates
      try {
        const ws = socket;
        if (ws && ws.readyState === WebSocket.OPEN) {
          for (const order of ordersArr) {
            try {
              ws.send(
                JSON.stringify({
                  type: "subscribe",
                  payload: { resource_type: "order", resource_id: order.id },
                }),
              );
            } catch {}
          }
        }
      } catch {}
    } catch (err) {
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  };

  const fetchReferenceCodes = async () => {
    try {
      const data = (await apiRequest(
        "/store/reference-codes",
      )) as ReferenceCode[];
      setReferenceCodes(data || []);
    } catch {
      toast.error("Failed to load reference codes");
    }
  };

  const resetReferenceForm = () => {
    setReferenceForm({
      code: "",
      user_id: "",
      incentive_amount: "",
      is_active: true,
    });
    setSelectedReferenceUser(null);
    setEditingReferenceCodeId(null);
  };

  const submitReferenceCode = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    const userID = Number.parseInt(referenceForm.user_id, 10);
    const incentiveAmount = Number.parseInt(referenceForm.incentive_amount, 10);
    if (
      !referenceForm.code.trim() ||
      !Number.isFinite(userID) ||
      !Number.isFinite(incentiveAmount)
    ) {
      toast.error("Code, user ID, and incentive amount are required.");
      return;
    }
    try {
      await apiRequest(
        editingReferenceCodeId
          ? `/store/reference-codes/${editingReferenceCodeId}`
          : "/store/reference-codes",
        {
          method: editingReferenceCodeId ? "PUT" : "POST",
          body: JSON.stringify({
            code: referenceForm.code,
            user_id: userID,
            incentive_amount: incentiveAmount,
            is_active: referenceForm.is_active,
          }),
        },
      );
      toast.success(
        editingReferenceCodeId
          ? "Reference code updated"
          : "Reference code created",
      );
      resetReferenceForm();
      fetchReferenceCodes();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save reference code",
      );
    }
  };

  const editReferenceCode = (code: ReferenceCode) => {
    setEditingReferenceCodeId(String(code.id));
    setSelectedReferenceUser(null);
    setReferenceForm({
      code: code.code,
      user_id: String(code.user_id),
      incentive_amount: String(code.incentive_amount),
      is_active: code.is_active,
    });
  };

  const deleteReferenceCode = async (id: string) => {
    if (!confirm("Delete this reference code?")) return;
    try {
      await apiRequest(`/store/reference-codes/${id}`, {
        method: "DELETE",
      });
      toast.success("Reference code deleted");
      if (editingReferenceCodeId === id) resetReferenceForm();
      fetchReferenceCodes();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete reference code",
      );
    }
  };

  const handleReferenceUserSelect = (user: User) => {
    setSelectedReferenceUser(user);
    setReferenceForm((prev) => ({ ...prev, user_id: String(user.id) }));
  };

  const clearReferenceUser = () => {
    setSelectedReferenceUser(null);
    setReferenceForm((prev) => ({ ...prev, user_id: "" }));
  };

  const renderOrderStatus = (order: Order) => (
    <div className="orders-status-cell">
      <span
        className={`orders-status orders-status--${order.status || "pending"}`}
      >
        {order.status}
      </span>
      {paymentsByOrder[order.id] && (
        <span
          className={`orders-payment orders-payment--${paymentsByOrder[order.id].status}`}
        >
          {paymentsByOrder[order.id].status === "succeeded"
            ? "Paid"
            : paymentsByOrder[order.id].status}
        </span>
      )}
    </div>
  );

  const renderOrderUser = (order: Order) => {
    if (order.is_guest) {
      return (
        <div className="orders-user-cell">
          <div className="guest-avatar">G</div>
          <span>Guest</span>
        </div>
      );
    }
    if (!order.user_id) return <span>Unknown</span>;
    return (
      <UserProfileOverlay userId={order.user_id}>
        <div className="orders-user-cell">
          <UserAvatar
            src={undefined}
            initials={`U${order.user_id}`}
            size={32}
          />
          <span>User #{order.user_id}</span>
        </div>
      </UserProfileOverlay>
    );
  };

  const renderOrderActions = (order: Order) => (
    <div className="order-actions">
      {order.status === "pending" && (
        <button
          type="button"
          className="action-btn edit-btn"
          onClick={(event) => {
            event.stopPropagation();
            updateOrderStatus(order.id, "accepted");
          }}
          title="Accept Order"
        >
          <CheckCircle size={16} />
        </button>
      )}
      <button
        type="button"
        className={`action-btn ${order.status === "completed" ? "active" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          updateOrderStatus(
            order.id,
            order.status === "completed" ? "pending" : "completed",
          );
        }}
        title={order.status === "completed" ? "Mark Pending" : "Mark Completed"}
      >
        {order.status === "completed" ? (
          <RotateCcw size={16} />
        ) : (
          <CheckCircle size={16} />
        )}
      </button>
      <button
        type="button"
        className="action-btn danger"
        onClick={(event) => {
          event.stopPropagation();
          deleteOrder(order.id);
        }}
        title="Delete Order"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );

  const referenceCodeColumns: TableColumn<ReferenceCode>[] = [
    {
      header: "Code",
      width: "minmax(120px, 1.2fr)",
      className: "table-view__cell--bold",
      cell: (code) => code.code,
    },
    {
      header: "User",
      width: "minmax(140px, 1fr)",
      cell: (code) => `User #${code.user_id}`,
    },
    {
      header: "Incentive",
      width: "minmax(110px, 0.8fr)",
      className: "table-view__cell--muted",
      cell: (code) => formatCents(code.incentive_amount),
    },
    {
      header: "Status",
      width: "minmax(90px, 0.7fr)",
      cell: (code) => (
        <span
          className={`orders-status ${
            code.is_active
              ? "orders-status--completed"
              : "orders-status--cancelled"
          }`}
        >
          {code.is_active ? "Active" : "Inactive"}
        </span>
      ),
    },
    {
      header: "Actions",
      width: "96px",
      className: "table-view__cell--actions",
      cell: (code) => (
        <div className="order-actions">
          <button
            type="button"
            className="action-btn edit-btn"
            onClick={() => editReferenceCode(code)}
            title="Edit Reference Code"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            className="action-btn danger"
            onClick={() => deleteReferenceCode(String(code.id))}
            title="Delete Reference Code"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ),
    },
  ];

  const orderColumns: TableColumn<Order>[] = [
    {
      header: "",
      width: "44px",
      cell: (order) => {
        const isExpanded = expandedOrders.has(order.id);
        return (
          <button
            type="button"
            className="orders-expand-btn"
            onClick={(event) => {
              event.stopPropagation();
              toggleExpand(order.id);
            }}
            title={isExpanded ? "Collapse Order" : "Expand Order"}
          >
            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        );
      },
    },
    {
      header: "Order",
      width: "minmax(110px, 0.8fr)",
      className: "table-view__cell--bold",
      cell: (order) => `#${order.id}`,
    },
    {
      header: "Date",
      width: "minmax(120px, 1fr)",
      className: "table-view__cell--muted",
      cell: (order) => new Date(order.created_at).toLocaleDateString(),
    },
    {
      header: "Total",
      width: "minmax(100px, 0.8fr)",
      cell: (order) => formatCents(order.total_price || 0),
    },
    {
      header: "Status",
      width: "minmax(170px, 1.4fr)",
      cell: renderOrderStatus,
    },
    ...(isStoreAdmin
      ? [
          {
            header: "User",
            width: "minmax(150px, 1.3fr)",
            cell: renderOrderUser,
          },
          {
            header: "Actions",
            width: "132px",
            className: "table-view__cell--actions",
            cell: renderOrderActions,
          },
        ]
      : []),
  ];

  const renderOrderRow = (
    order: Order,
    _index: number,
    rowProps: { className: string; style: React.CSSProperties },
    cells: React.ReactNode[],
  ) => {
    const isExpanded = expandedOrders.has(order.id);
    return (
      <React.Fragment key={order.id}>
        <div
          {...rowProps}
          className={`${rowProps.className} order-row-hover`}
          onClick={() => navigate(`/store/orders/${order.id}`)}
        >
          {cells}
        </div>
        {isExpanded && (
          <div className="orders-expanded-row">
            <OrderSubmittedView order={order} onBackLink="/store/orders" />
          </div>
        )}
      </React.Fragment>
    );
  };

  const referenceUserLabel = selectedReferenceUser
    ? selectedReferenceUser.display_name || selectedReferenceUser.username
    : referenceForm.user_id
      ? `User #${referenceForm.user_id}`
      : "No user selected";

  const referenceSectionTitle = editingReferenceCodeId
    ? "Edit Reference Code"
    : "Reference Codes";

  const saveReferenceLabel = editingReferenceCodeId ? "Save" : "Create";

  const updateOrderStatus = async (id: string, status: string) => {
    try {
      await apiRequest(`/store/orders/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({
          status,
        }),
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
    <StorePageShell className="store-orders-shell" backTo="/store">
      <DirectoryLayout
        className="orders-directory"
        title="Store Orders"
        subtitle="Manage your past and current orders."
        items={orders}
        viewMode="list"
        renderGridCard={() => null}
        customListContent={
          <>
            {isStoreAdmin && (
              <section className="reference-codes-panel">
                <h3>{referenceSectionTitle}</h3>
                <form
                  onSubmit={submitReferenceCode}
                  className="reference-code-form"
                >
                  <input
                    className="form-input reference-code-input reference-code-input--code"
                    placeholder="Code"
                    value={referenceForm.code}
                    onChange={(event) =>
                      setReferenceForm((prev) => ({
                        ...prev,
                        code: event.target.value,
                      }))
                    }
                  />
                  <div className="reference-code-person">
                    <PersonPicker
                      placeholder="Assign user..."
                      excludeSelf={false}
                      autoFocus={false}
                      resultsVariant="glass-menu"
                      clearQueryOnSelect={true}
                      onSelect={handleReferenceUserSelect}
                    />
                  </div>
                  <input
                    className="form-input reference-code-input reference-code-input--amount"
                    inputMode="numeric"
                    placeholder="Incentive cents"
                    value={referenceForm.incentive_amount}
                    onChange={(event) =>
                      setReferenceForm((prev) => ({
                        ...prev,
                        incentive_amount: event.target.value,
                      }))
                    }
                  />
                  <label className="cart-checkbox-label" style={{ margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={referenceForm.is_active}
                      onChange={(event) =>
                        setReferenceForm((prev) => ({
                          ...prev,
                          is_active: event.target.checked,
                        }))
                      }
                    />
                    Active
                  </label>
                  <button type="submit" className="btn btn-primary">
                    {saveReferenceLabel}
                  </button>
                  {editingReferenceCodeId && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={resetReferenceForm}
                    >
                      Cancel
                    </button>
                  )}
                  <div
                    className={`reference-code-selected-user ${
                      selectedReferenceUser || referenceForm.user_id
                        ? "reference-code-selected-user--filled"
                        : "reference-code-selected-user--empty"
                    }`}
                  >
                    {selectedReferenceUser ? (
                      <UserProfileOverlay
                        userId={selectedReferenceUser.id}
                        fallbackName={
                          selectedReferenceUser.display_name ||
                          selectedReferenceUser.username
                        }
                        fallbackAvatar={
                          selectedReferenceUser.avatar_url || undefined
                        }
                        disableClick={true}
                      >
                        <UserAvatar
                          src={selectedReferenceUser.avatar_url || undefined}
                          alt={
                            selectedReferenceUser.display_name ||
                            selectedReferenceUser.username
                          }
                          size={24}
                          initials={(
                            selectedReferenceUser.display_name ||
                            selectedReferenceUser.username
                          )?.[0]?.toUpperCase()}
                        />
                      </UserProfileOverlay>
                    ) : referenceForm.user_id ? (
                      <UserAvatar
                        src={undefined}
                        alt={referenceUserLabel}
                        size={24}
                        initials="#"
                      />
                    ) : (
                      <span
                        className="reference-code-selected-user__avatar-placeholder"
                        aria-hidden="true"
                      />
                    )}
                    <span className="reference-code-selected-user__content">
                      <span className="reference-code-selected-user__name">
                        {selectedReferenceUser || referenceForm.user_id
                          ? referenceUserLabel
                          : "No user selected"}
                      </span>
                      {selectedReferenceUser ? (
                        <span className="reference-code-selected-user__username">
                          @{selectedReferenceUser.username}
                        </span>
                      ) : referenceForm.user_id ? (
                        <span className="reference-code-selected-user__username">
                          Selected by ID
                        </span>
                      ) : (
                        <span className="reference-code-selected-user__username">
                          Pick a user from search
                        </span>
                      )}
                    </span>
                    {(selectedReferenceUser || referenceForm.user_id) && (
                      <button
                        type="button"
                        className="reference-code-selected-user__clear"
                        onClick={clearReferenceUser}
                        title="Clear selected user"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </form>
                <TableView
                  data={referenceCodes}
                  columns={referenceCodeColumns}
                  rowKey={(code) => code.id}
                  maxHeight={280}
                  emptyState={
                    <p className="orders-empty-state">
                      No reference codes yet.
                    </p>
                  }
                />
              </section>
            )}
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
                <TableView
                  data={orders}
                  columns={orderColumns}
                  rowKey={(order) => order.id}
                  renderRowWrapper={renderOrderRow}
                  maxHeight={680}
                />
              )}
            </div>
          </>
        }
      />

      {mapPopover &&
        document.body &&
        createPortal(
          <>
            <div
              role="button"
              tabIndex={-1}
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 9998,
              }}
              onClick={() => setMapPopover(null)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setMapPopover(null);
              }}
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
                  type="button"
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
                    const lat = Number.parseFloat(parts[0]);
                    const lng = Number.parseFloat(parts[1]);
                    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
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
    </StorePageShell>
  );
};

export default OrdersPage;
