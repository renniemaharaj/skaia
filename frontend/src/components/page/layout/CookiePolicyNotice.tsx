import { Cookie } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { LegalConfig } from "../../../types/legal";
import { apiRequest } from "../../../utils/api";
import {
  isPolicyAccepted,
  setPolicyAccepted,
  subscribeToPolicyAcceptance,
} from "../../../utils/policyAcceptance";
import Checkbox from "../../input/Checkbox";

export function CookiePolicyNotice() {
  const [config, setConfig] = useState<LegalConfig | null>(null);
  const [acceptanceRevision, rerender] = useState(0);

  useEffect(() => {
    let active = true;
    apiRequest<LegalConfig>("/config/legal/manifest")
      .then(value => {
        if (active) setConfig(value);
      })
      .catch(() => {
        if (active) setConfig(null);
      });
    const unsubscribe = subscribeToPolicyAcceptance(() => rerender(value => value + 1));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const policies = useMemo(() => {
    if (!config) return [];
    const selected = new Set(config.cookie_policy_ids ?? []);
    return (config.policies ?? []).filter(
      policy => selected.has(policy.id) && !isPolicyAccepted(policy.id)
    );
  }, [config, acceptanceRevision]);

  if (policies.length === 0) return null;

  return (
    <aside className="layout-guest-sandbox-banner layout-policy-banner" aria-label="Cookie policies">
      <Cookie size={16} className="layout-guest-sandbox-icon" aria-hidden="true" />
      <div className="layout-policy-banner__copy">
        <strong>Cookie policies</strong>
        <span>Review and accept the policies that apply to this site.</span>
      </div>
      <div className="layout-policy-banner__choices">
        {policies.map(policy => (
          <Checkbox
            key={policy.id}
            size="sm"
            checked={false}
            label={
              <>
                I accept <Link to={`/page/${policy.page_slug}`}>{policy.name}</Link>
              </>
            }
            onChange={event => setPolicyAccepted(policy.id, event.target.checked)}
          />
        ))}
      </div>
    </aside>
  );
}
