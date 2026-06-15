import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { ShoppingBag, ExternalLink, AlertCircle } from "lucide-react";
import { apiRequest } from "../../utils/api";
import { useAtomValue } from "jotai";
import { currentUserAtom, hasPermissionAtom } from "../../atoms/auth";
import type { Order } from "../../atoms/store";
import { TableView } from "../../components/ui/TableView/TableView";

interface Props {
  userId: string | undefined;
  displayName: string;
}

const UserOrders: React.FC<Props> = ({ userId, displayName }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentUser = useAtomValue(currentUserAtom);
  const hasPermission = useAtomValue(hasPermissionAtom);
  const isOwnProfile = String(currentUser?.id) === String(userId);
  const canManage = hasPermission("store.manageOrders");

  const fetchOrders = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const url = canManage
        ? `/store/orders?user_id=${userId}`
        : "/store/orders";
      const data = (await apiRequest(url)) as any;
      setOrders(data || []);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [userId, canManage]);

  useEffect(() => {
    // Only fetch if they are the owner or an admin
    if (isOwnProfile || canManage) {
      fetchOrders();
    } else {
      setLoading(false);
    }
  }, [fetchOrders, isOwnProfile, canManage]);

  if (!isOwnProfile && !canManage) {
    return null; // Don't show orders section to unauthorized users
  }

  if (loading) {
    return (
      <div className="up-uploads-section">
        <h2 className="up-section-heading">
          <ShoppingBag size={18} /> Orders
        </h2>
        <div className="up-uploads-loading">
          <span className="up-spinner" /> Loading orders…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="up-uploads-section">
        <h2 className="up-section-heading">
          <ShoppingBag size={18} /> Orders
        </h2>
        <p className="up-uploads-error">
          <AlertCircle size={14} /> {error}
        </p>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="up-uploads-section">
        <h2
          className="up-section-heading"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <ShoppingBag size={18} />
            Orders by {displayName}
          </div>
        </h2>
        <p className="up-empty-hint">No orders yet</p>
      </div>
    );
  }

  return (
    <div className="up-uploads-section">
      <h2
        className="up-section-heading"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <ShoppingBag size={18} />
          Orders by {displayName}
          <span className="up-uploads-count">{orders.length}</span>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <Link
            to={`/store/orders`}
            className="action-btn"
            title="Open Directory Route"
          >
            <ExternalLink size={16} />
          </Link>
        </div>
      </h2>

      <TableView<Order>
        data={orders.slice(0, 5)} // Only show 5 most recent
        columns={[
          {
            header: "Order ID",
            width: "120px",
            className: "table-view__cell--bold",
            cell: (o) => `#${o.id}`,
          },
          {
            header: "Status",
            width: "100px",
            cell: (o) => (
              <div
                style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
              >
                <span
                  style={{
                    textTransform: "capitalize",
                    color: "var(--color-primary)",
                  }}
                >
                  {o.status}
                </span>
                {(o as any).payment && (
                  <span
                    style={{
                      fontSize: "0.85rem",
                      padding: "0.25rem 0.5rem",
                      borderRadius: "6px",
                      background: "var(--bg-secondary)",
                      color:
                        (o as any).payment.status === "succeeded"
                          ? "var(--color-success)"
                          : (o as any).payment.status === "failed"
                            ? "var(--color-danger)"
                            : "var(--text-secondary)",
                      fontWeight: 600,
                    }}
                  >
                    {(o as any).payment.status === "succeeded"
                      ? "Paid"
                      : (o as any).payment.status}
                  </span>
                )}
              </div>
            ),
          },
          {
            header: "Total",
            width: "100px",
            cell: (o) => `$${(o.total_price / 100).toFixed(2)}`,
          },
          {
            header: "Date",
            width: "minmax(140px, 1fr)",
            className: "table-view__cell--muted",
            cell: (o) => new Date(o.created_at).toLocaleDateString(),
          },
        ]}
      />
      {orders.length > 5 && (
        <div style={{ textAlign: "center", marginTop: "1rem" }}>
          <Link to="/store/orders" className="btn btn-secondary btn-sm">
            View All Orders
          </Link>
        </div>
      )}
    </div>
  );
};

export default UserOrders;
