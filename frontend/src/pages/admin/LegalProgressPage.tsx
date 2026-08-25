import { useAtomValue } from "jotai";
import { Cookie, FileText, PanelBottom, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { hasPermissionAtom } from "../../atoms/auth";
import { useLayoutPosition } from "../../atoms/viewModes";
import Button from "../../components/input/Button";
import Checkbox from "../../components/input/Checkbox";
import { ModulePageShell } from "../../components/layout/ModulePageShell";
import {
  DirectoryLayout,
  type ViewMode,
} from "../../components/page/layout/templates/DirectoryLayout";
import { customConfirm } from "../../components/ui/Prompt";
import { SkeletonContent } from "../../components/ui/Skeleton";
import type { LegalConfig, LegalPolicy } from "../../types/legal";
import { apiRequest } from "../../utils/api";
import "./LegalProgressPage.css";

interface PolicyPage {
  id: number;
  slug: string;
  content: string;
}

interface PolicyState {
  policy: LegalPolicy;
  page: PolicyPage | null;
}

type PlacementKey = "cookie_policy_ids" | "footer_policy_ids";

export default function LegalProgressPage() {
  const hasPermission = useAtomValue(hasPermissionAtom);
  const canManage = hasPermission("home.manage");
  const [policies, setPolicies] = useState<PolicyState[]>([]);
  const [config, setConfig] = useState<LegalConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [workingPolicyID, setWorkingPolicyID] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useLayoutPosition<ViewMode>("site-policies", "grid");

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiRequest<LegalConfig>("/config/legal/manifest")
      .then(async value => {
        const normalized = normalizeLegalConfig(value);
        const states = await loadPolicyPages(normalized.policies);
        if (!active) return;
        setConfig(normalized);
        setPolicies(states);
        setLoadError(false);
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [revision]);

  const completed = policies.filter(({ page }) => hasAuthoredContent(page?.content)).length;
  const filteredPolicies = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return policies;
    return policies.filter(({ policy, page }) =>
      [policy.name, policy.description, policy.page_slug, policyStatus(page).label].some(value =>
        value.toLocaleLowerCase().includes(query)
      )
    );
  }, [policies, search]);

  const emptyState = loading ? (
    <div className="legal-policy-directory__skeletons">
      {Array.from({ length: 3 }, (_, index) => (
        <SkeletonContent
          key={`policy-skeleton-${index}`}
          variant="card"
          label={index === 0 ? "Loading site policies" : undefined}
          announce={index === 0}
        />
      ))}
    </div>
  ) : loadError ? (
    <div className="legal-policy-directory__empty" role="alert">
      <h2>Site policy status is unavailable</h2>
      <p>Reload this page to try again.</p>
    </div>
  ) : (
    <div className="legal-policy-directory__empty">
      <FileText size={28} aria-hidden="true" />
      <h2>{policies.length ? "No matching policies" : "No policies yet"}</h2>
      <p>
        {policies.length
          ? "Try a different policy name, description, URL, or status."
          : canManage
            ? "Create a policy to receive a public custom page ready for editing."
            : "This site has not published any policy pages yet."}
      </p>
      {!policies.length && canManage && (
        <Link className="sk-btn sk-btn--primary sk-btn--md" to="/form/site/legal/new">
          Add policy
        </Link>
      )}
    </div>
  );

  return (
    <ModulePageShell backTo="/" backLabel="Exit policies" width="comfortable">
      <div className="legal-policy-page" aria-busy={loading || undefined}>
        {!loading && !loadError && (
          <section className="legal-policy-progress" aria-labelledby="policy-progress-title">
            <div className="legal-policy-progress__heading">
              <div>
                <strong id="policy-progress-title">
                  {completed} of {policies.length} policies configured
                </strong>
                <span>Policies configured</span>
              </div>
              <span>{policies.length ? Math.round((completed / policies.length) * 100) : 0}%</span>
            </div>
            <progress
              value={completed}
              max={policies.length || 1}
              aria-label={`${completed} of ${policies.length} policies configured`}
            />
            <small>Configured policies have a public page with authored content.</small>
          </section>
        )}

        <DirectoryLayout
          className="legal-policy-directory"
          title="Site policies"
          subtitle={
            canManage
              ? "Create and publish policy pages, then choose where each one appears."
              : "Review the policies and publication progress for this site."
          }
          searchPlaceholder="Search policies..."
          searchValue={search}
          onSearchChange={setSearch}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          headerActions={
            canManage && policies.length > 0 ? (
              <Link className="sk-btn sk-btn--primary sk-btn--sm" to="/form/site/legal/new">
                <Plus size={15} aria-hidden="true" />
                Add policy
              </Link>
            ) : undefined
          }
          metrics={[
            <span key="visible-count">
              <strong>{filteredPolicies.length}</strong>{" "}
              {filteredPolicies.length === 1 ? "policy" : "policies"}
            </span>,
            <span key="cookie-count">
              <strong>{config?.cookie_policy_ids.length ?? 0}</strong> in cookie banner
            </span>,
            <span key="footer-count">
              <strong>{config?.footer_policy_ids.length ?? 0}</strong> in footer
            </span>,
          ]}
          items={loading || loadError ? [] : filteredPolicies}
          emptyState={emptyState}
          tableColumns={[
            {
              header: "Policy",
              width: "minmax(230px, 2fr)",
              cell: item => (
                <Link className="legal-policy-table__policy" to={policyRoute(item)}>
                  <span className="legal-policy-card__icon">
                    <FileText size={16} aria-hidden="true" />
                  </span>
                  <span>
                    <strong>{item.policy.name}</strong>
                    <small>{item.policy.description || item.policy.page_slug}</small>
                  </span>
                </Link>
              ),
            },
            {
              header: "Status",
              width: "130px",
              cell: item => <PolicyStatusBadge page={item.page} />,
            },
            {
              header: "Cookie banner",
              width: canManage ? "150px" : "120px",
              cell: item =>
                renderPlacementControl(item.policy.id, "cookie_policy_ids", "Cookie banner"),
            },
            {
              header: "Footer",
              width: canManage ? "120px" : "100px",
              cell: item => renderPlacementControl(item.policy.id, "footer_policy_ids", "Footer"),
            },
            ...(canManage
              ? [
                  {
                    header: "Actions",
                    width: "100px",
                    cell: (item: PolicyState) => (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={workingPolicyID !== null}
                        aria-label={`Delete ${item.policy.name}`}
                        iconLeft={<Trash2 size={14} />}
                        onClick={() => void deletePolicy(item.policy)}
                      >
                        Delete
                      </Button>
                    ),
                  },
                ]
              : []),
          ]}
          tableRowKey={item => item.policy.id}
          renderGridCard={item => (
            <article className="legal-policy-card" key={item.policy.id}>
              <Link className="legal-policy-card__main" to={policyRoute(item)}>
                <div className="legal-policy-card__heading">
                  <span className="legal-policy-card__icon">
                    <FileText size={18} aria-hidden="true" />
                  </span>
                  <PolicyStatusBadge page={item.page} />
                </div>
                <div className="legal-policy-card__copy">
                  <h2>{item.policy.name}</h2>
                  <p>{policyDescription(item.policy, item.page)}</p>
                </div>
                {!canManage && <PolicyPlacementBadges config={config} policy={item.policy} />}
              </Link>
              {canManage && (
                <div
                  className="legal-policy-card__controls"
                  aria-label={`${item.policy.name} placement`}
                >
                  <Checkbox
                    size="sm"
                    label="Cookie banner"
                    checked={config?.cookie_policy_ids.includes(item.policy.id) ?? false}
                    disabled={workingPolicyID !== null}
                    onChange={event =>
                      void togglePolicyPlacement(
                        item.policy.id,
                        "cookie_policy_ids",
                        event.target.checked
                      )
                    }
                  />
                  <Checkbox
                    size="sm"
                    label="Footer"
                    checked={config?.footer_policy_ids.includes(item.policy.id) ?? false}
                    disabled={workingPolicyID !== null}
                    onChange={event =>
                      void togglePolicyPlacement(
                        item.policy.id,
                        "footer_policy_ids",
                        event.target.checked
                      )
                    }
                  />
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={workingPolicyID !== null}
                    aria-label={`Delete ${item.policy.name}`}
                    iconLeft={<Trash2 size={14} />}
                    onClick={() => void deletePolicy(item.policy)}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </article>
          )}
        />

        <aside className="legal-policy-process">
          <FileText size={20} aria-hidden="true" />
          <div>
            <h2>{canManage ? "Publish with the page builder" : "How site policies work"}</h2>
            <p>
              {canManage
                ? "Open a policy to author its public page. Cookie-banner, footer, and checkout placement are configured independently; browser acceptance is convenience state, not a server receipt."
                : "Open any policy to read its public page. Policies may also appear in the cookie banner, site footer, or checkout when the site operator selects those placements."}
            </p>
          </div>
        </aside>
      </div>
    </ModulePageShell>
  );

  function renderPlacementControl(policyID: string, key: PlacementKey, label: string) {
    const selected = config?.[key].includes(policyID) ?? false;
    if (!canManage) {
      return (
        <span className={`legal-policy-placement ${selected ? "is-selected" : ""}`}>
          {selected ? "Included" : "Not included"}
        </span>
      );
    }
    return (
      <Checkbox
        size="sm"
        label={label}
        checked={selected}
        disabled={workingPolicyID !== null}
        onChange={event => void togglePolicyPlacement(policyID, key, event.target.checked)}
      />
    );
  }

  async function deletePolicy(policy: LegalPolicy) {
    if (!config || !canManage) return;
    const confirmed = await customConfirm({
      title: `Delete ${policy.name}?`,
      body: "The policy page will move to Trash and all of its placements will be removed.",
      confirmLabel: "Delete policy",
      destructive: true,
    });
    if (!confirmed) return;
    setWorkingPolicyID(policy.id);
    try {
      await saveLegalConfig({
        ...config,
        policies: config.policies.filter(item => item.id !== policy.id),
        cookie_policy_ids: config.cookie_policy_ids.filter(id => id !== policy.id),
        footer_policy_ids: config.footer_policy_ids.filter(id => id !== policy.id),
        checkout_policy_ids: config.checkout_policy_ids.filter(id => id !== policy.id),
      });
      try {
        await apiRequest(`/pages/${policy.page_id}`, { method: "DELETE" });
        toast.success("Policy deleted");
      } catch {
        toast.warning("Policy removed; its page could not be moved to Trash");
      }
      setRevision(value => value + 1);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Policy could not be deleted");
    } finally {
      setWorkingPolicyID(null);
    }
  }

  async function togglePolicyPlacement(
    policyID: string,
    key: PlacementKey,
    enabled: boolean
  ) {
    if (!config || !canManage) return;
    setWorkingPolicyID(policyID);
    try {
      await saveLegalConfig({
        ...config,
        [key]: enabled ? [...config[key], policyID] : config[key].filter(id => id !== policyID),
      });
      setRevision(value => value + 1);
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "Policy placement could not be updated"
      );
    } finally {
      setWorkingPolicyID(null);
    }
  }
}

function normalizeLegalConfig(config: LegalConfig): LegalConfig {
  return {
    ...config,
    policies: config.policies ?? [],
    cookie_policy_ids: config.cookie_policy_ids ?? [],
    footer_policy_ids: config.footer_policy_ids ?? [],
    checkout_policy_ids: config.checkout_policy_ids ?? [],
  };
}

async function loadPolicyPages(policies: LegalPolicy[]) {
  const states: PolicyState[] = [];
  for (let index = 0; index < policies.length; index += 8) {
    const group = await Promise.all(
      policies.slice(index, index + 8).map(async policy => {
        try {
          const page = await apiRequest<PolicyPage>(`/pages/${policy.page_slug}`);
          return { policy, page: page.id === policy.page_id ? page : null };
        } catch {
          return { policy, page: null };
        }
      })
    );
    states.push(...group);
  }
  return states;
}

function hasAuthoredContent(content?: string) {
  if (!content) return false;
  try {
    const sections = JSON.parse(content);
    return Array.isArray(sections) && sections.length > 0;
  } catch {
    return false;
  }
}

function policyStatus(page: PolicyPage | null) {
  if (!page) return { label: "Page missing", tone: "attention" } as const;
  if (!hasAuthoredContent(page.content)) {
    return { label: "Needs content", tone: "attention" } as const;
  }
  return { label: "Configured", tone: "complete" } as const;
}

function PolicyStatusBadge({ page }: { page: PolicyPage | null }) {
  const status = policyStatus(page);
  return (
    <span className={`legal-policy-status legal-policy-status--${status.tone}`}>{status.label}</span>
  );
}

function PolicyPlacementBadges({
  config,
  policy,
}: {
  config: LegalConfig | null;
  policy: LegalPolicy;
}) {
  const inCookieBanner = config?.cookie_policy_ids.includes(policy.id) ?? false;
  const inFooter = config?.footer_policy_ids.includes(policy.id) ?? false;
  return (
    <div className="legal-policy-card__placements" aria-label="Policy placements">
      {inCookieBanner && (
        <span>
          <Cookie size={13} aria-hidden="true" /> Cookie banner
        </span>
      )}
      {inFooter && (
        <span>
          <PanelBottom size={13} aria-hidden="true" /> Footer
        </span>
      )}
      {!inCookieBanner && !inFooter && <span>Policy page</span>}
    </div>
  );
}

function policyRoute({ policy, page }: PolicyState) {
  return page ? `/page/${policy.page_slug}` : "/pages";
}

function policyDescription(policy: LegalPolicy, page: PolicyPage | null) {
  if (!page) return `${policy.description || "This policy"} no longer has its referenced page.`;
  if (!hasAuthoredContent(page.content)) {
    return policy.description || "The policy page is ready for content.";
  }
  return policy.description || "Open the published policy page.";
}

async function saveLegalConfig(config: LegalConfig) {
  return apiRequest<LegalConfig>("/config/legal", {
    method: "PUT",
    body: JSON.stringify(config),
  });
}
