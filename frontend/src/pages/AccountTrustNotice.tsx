import { ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Button from "../components/input/Button";
import { apiRequest } from "../utils/api";
import { getServerNow } from "../utils/serverTime";

export interface AccountTrustStatus {
  tier: "guest" | "provisional" | "established";
  established: boolean;
  totp_enabled: boolean;
  unlock_at?: string;
  remaining_seconds: number;
}

const dismissKey = "account.provisionalNoticeDismissed";

function countdownLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export default function AccountTrustNotice({ userId }: { userId?: string }) {
  const [status, setStatus] = useState<AccountTrustStatus | null>(null);
  const [visible, setVisible] = useState(() => sessionStorage.getItem(dismissKey) !== "1");
  const [remaining, setRemaining] = useState(0);

  const refresh = useMemo(
    () => async () => {
      if (!userId) {
        setStatus(null);
        return;
      }
      try {
        const next = await apiRequest<AccountTrustStatus>("/auth/trust-status");
        setStatus(next);
        if (next.tier === "provisional") {
          const serverRemaining = next.unlock_at
            ? Math.max(0, Math.ceil((Date.parse(next.unlock_at) - getServerNow()) / 1000))
            : next.remaining_seconds;
          setRemaining(serverRemaining);
        }
      } catch {
        // Browsing remains available when status cannot be refreshed. The
        // backend still owns authorization and will surface the notice on deny.
      }
    },
    [userId]
  );

  useEffect(() => {
    void refresh();
    const onProvisional = (event: Event) => {
      const detail = (event as CustomEvent<AccountTrustStatus>).detail;
      if (detail) setStatus(detail);
      setRemaining(detail?.remaining_seconds ?? 0);
      setVisible(true);
      sessionStorage.removeItem(dismissKey);
    };
    const onRefresh = () => void refresh();
    window.addEventListener("account:provisional", onProvisional);
    window.addEventListener("account:trust-refresh", onRefresh);
    return () => {
      window.removeEventListener("account:provisional", onProvisional);
      window.removeEventListener("account:trust-refresh", onRefresh);
    };
  }, [refresh]);

  useEffect(() => {
    if (status?.tier !== "provisional" || remaining <= 0) return;
    const timer = window.setInterval(() => {
      setRemaining(value => {
        if (value <= 1) {
          window.clearInterval(timer);
          void refresh();
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status?.tier, remaining <= 0, refresh]);

  if (!visible || status?.tier !== "provisional") return null;

  return (
    <section className="account-trust-notice" aria-live="polite" aria-label="New account limits">
      <ShieldCheck size={20} aria-hidden="true" />
      <div className="account-trust-notice__copy">
        <strong>Your account is ready for browsing and global chat.</strong>
        <span>
          Account actions unlock in {countdownLabel(remaining)}. Setting up optional TOTP unlocks
          them immediately.
        </span>
      </div>
      <div className="account-trust-notice__actions">
        <Link
          className="sk-btn sk-btn--primary sk-btn--md account-trust-notice__setup"
          to="/settings/security"
        >
          Set up TOTP
        </Link>
        <Button
          variant="action"
          onClick={() => {
            sessionStorage.setItem(dismissKey, "1");
            setVisible(false);
          }}
        >
          Continue browsing
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="account-trust-notice__close"
          aria-label="Dismiss new account notice"
          onClick={() => {
            sessionStorage.setItem(dismissKey, "1");
            setVisible(false);
          }}
        >
          <X size={15} aria-hidden="true" />
        </Button>
      </div>
    </section>
  );
}
