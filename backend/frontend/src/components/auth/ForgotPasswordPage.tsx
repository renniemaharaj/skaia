import { useAtomValue } from "jotai";
import {
  AlertCircle,
  CheckCircle,
  Loader,
  Mail,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { hasPermissionAtom } from "../../atoms/auth";
import {
  acceptRecoveryRequest,
  forgotPassword,
  listRecoveryRequests,
  rejectRecoveryRequest,
  type RecoveryRequest,
} from "../../utils/api";
import { getGuestSessionId } from "../../utils/guestSession";
import { type TableColumn, TableView } from "../ui/TableView/TableView";
import "./Auth.css";
import "../ui/FormGroup.css";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [actionRequestId, setActionRequestId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [requests, setRequests] = useState<RecoveryRequest[]>([]);
  const [ownRequest, setOwnRequest] = useState<RecoveryRequest | null>(null);
  const [ownRequestMessage, setOwnRequestMessage] = useState<string | null>(null);
  const canManageUsers = useAtomValue(hasPermissionAtom)("user.manage-others");
  const navigate = useNavigate();

  const fetchRequests = useCallback(async () => {
    if (!canManageUsers) return;
    setRequestsLoading(true);
    try {
      setRequests((await listRecoveryRequests()) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recovery requests");
    } finally {
      setRequestsLoading(false);
    }
  }, [canManageUsers]);

  useEffect(() => {
    fetchRequests();
    const handleRecoveryUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string; data?: RecoveryRequest }>).detail;
      if (canManageUsers) {
        fetchRequests();
      }
      if (detail?.data?.id && ownRequest?.id === detail.data.id && detail.action !== "created") {
        setOwnRequest(null);
        setOwnRequestMessage(null);
      }
    };
    window.addEventListener("recovery_request:update", handleRecoveryUpdate);
    return () => window.removeEventListener("recovery_request:update", handleRecoveryUpdate);
  }, [canManageUsers, fetchRequests, ownRequest?.id]);

  useEffect(() => {
    const handleAccepted = () => {
      setOwnRequest(null);
      setOwnRequestMessage("Your recovery request was accepted. Signing you in...");
      navigate("/");
    };
    window.addEventListener("recovery_request:accepted", handleAccepted);
    return () => window.removeEventListener("recovery_request:accepted", handleAccepted);
  }, [navigate]);

  useEffect(() => {
    if (!canManageUsers || requests.length === 0) return;
    const now = Date.now();
    const nextExpiry = requests.reduce((soonest, request) => {
      const expiresAt = new Date(request.expires_at).getTime();
      if (!Number.isFinite(expiresAt) || expiresAt <= now) return soonest;
      return Math.min(soonest, expiresAt);
    }, Number.POSITIVE_INFINITY);

    if (!Number.isFinite(nextExpiry)) {
      setRequests(prev =>
        prev.filter(request => new Date(request.expires_at).getTime() > Date.now())
      );
      return;
    }

    const timeout = window.setTimeout(() => {
      setRequests(prev =>
        prev.filter(request => new Date(request.expires_at).getTime() > Date.now())
      );
    }, Math.max(nextExpiry - now, 0) + 250);
    return () => window.clearTimeout(timeout);
  }, [canManageUsers, requests]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await forgotPassword(email, getGuestSessionId());
      setSent(true);
      setOwnRequest(data.request ?? null);
      setOwnRequestMessage(
        data.status === "already_pending"
          ? "You already have a request pending."
          : data.message || null
      );
      fetchRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const acceptRequest = async (request: RecoveryRequest) => {
    setError(null);
    setActionRequestId(request.id);
    try {
      const result = await acceptRecoveryRequest(request.id);
      if (!result.delivered) {
        setError("Accepted, but the requester is no longer connected.");
      }
      fetchRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept recovery request");
      fetchRequests();
    } finally {
      setActionRequestId(null);
    }
  };

  const rejectRequest = async (request: RecoveryRequest) => {
    setError(null);
    setActionRequestId(request.id);
    try {
      await rejectRecoveryRequest(request.id);
      fetchRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject recovery request");
    } finally {
      setActionRequestId(null);
    }
  };

  const columns = useMemo<TableColumn<RecoveryRequest>[]>(
    () => [
      {
        header: "Email",
        width: "minmax(180px, 1.6fr)",
        className: "table-view__cell--bold",
        cell: request => request.email,
      },
      {
        header: "Account",
        width: "minmax(160px, 1.2fr)",
        cell: request => (
          <div className="recovery-account-cell">
            <span>{request.display_name || request.username}</span>
            <span>@{request.username}</span>
          </div>
        ),
      },
      {
        header: "Requested",
        width: "minmax(120px, 0.9fr)",
        className: "table-view__cell--muted",
        cell: request => new Date(request.created_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
      {
        header: "Expires",
        width: "minmax(120px, 0.9fr)",
        className: "table-view__cell--muted",
        cell: request => new Date(request.expires_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
      {
        header: "Actions",
        width: "116px",
        className: "table-view__cell--actions",
        cell: request => (
          <div className="recovery-actions">
            <button
              type="button"
              className="recovery-action-btn recovery-action-btn--accept"
              onClick={() => acceptRequest(request)}
              disabled={actionRequestId === request.id}
              title="Accept and open account"
            >
              <ShieldCheck size={16} />
            </button>
            <button
              type="button"
              className="recovery-action-btn recovery-action-btn--reject"
              onClick={() => rejectRequest(request)}
              disabled={actionRequestId === request.id}
              title="Reject request"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ),
      },
    ],
    [actionRequestId]
  );

  return (
    <div className="auth-page">
      <div className={`auth-container ${canManageUsers ? "auth-container--wide" : ""}`}>
        <div className="auth-card">
          <div className="auth-header">
            <h1>Recover Account</h1>
            <p>
              {sent
                ? "Your request is ready for administrator review"
                : "Enter your email and an administrator can review your request"}
            </p>
          </div>

          {error && (
            <div className="auth-error">
              <AlertCircle size={20} />
              <span>{error}</span>
            </div>
          )}

          {sent ? (
            <div className="auth-success">
              <CheckCircle size={20} />
              <span>{ownRequestMessage ?? "If an account with that email exists, your request has been queued for review."}</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="auth-form">
              <div className="form-group">
                <label htmlFor="email">Email Address</label>
                <div className="input-wrapper">
                  <Mail size={20} className="input-icon" />
                  <input
                    id="email"
                    type="email"
                    placeholder="Enter your email address"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <button type="submit" className="auth-button" disabled={loading}>
                {loading ? (
                  <>
                    <Loader size={20} className="spinning" />
                    Requesting...
                  </>
                ) : (
                  "Request Account Recovery"
                )}
              </button>
            </form>
          )}

          {ownRequest && (
            <div className="recovery-own-request">
              <span>Requested {new Date(ownRequest.created_at).toLocaleString()}</span>
              <span>Expires {new Date(ownRequest.expires_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}</span>
            </div>
          )}

          <div className="auth-divider">
            <span>or</span>
          </div>

          <div className="auth-toggle">
            <p>
              Remember your password?
              <Link to="/login" className="auth-toggle-btn">
                Log in
              </Link>
            </p>
          </div>
        </div>

        {canManageUsers && (
          <section className="recovery-requests-panel">
            <div className="recovery-requests-panel__header">
              <div>
                <h2>Recovery Requests</h2>
                <p>Live requests appear here as users ask for account recovery.</p>
              </div>
            </div>
            <TableView
              data={requests}
              columns={columns}
              rowKey={request => request.id}
              maxHeight={320}
              emptyState={
                <div className="recovery-empty-state">
                  {requestsLoading ? "Loading recovery requests..." : "No pending recovery requests."}
                </div>
              }
            />
          </section>
        )}

        <div className="auth-bg-decoration">
          <div className="decoration-circle decoration-circle-1" />
          <div className="decoration-circle decoration-circle-2" />
          <div className="decoration-circle decoration-circle-3" />
        </div>
      </div>
    </div>
  );
}
