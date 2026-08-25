import { FileText, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import Button from "../../components/input/Button";
import Checkbox from "../../components/input/Checkbox";
import { ModulePageShell } from "../../components/layout/ModulePageShell";
import {
  SetupHub,
  SetupHubCallout,
  SetupHubCard,
  SetupHubSection,
  type SetupHubStatus,
} from "../../components/layout/SetupHub";
import { customConfirm } from "../../components/ui/Prompt";
import type { LegalConfig, LegalPolicy } from "../../types/legal";
import { apiRequest } from "../../utils/api";

interface PolicyPage {
  id: number;
  slug: string;
  content: string;
}

interface PolicyState {
  policy: LegalPolicy;
  page: PolicyPage | null;
}

export default function LegalProgressPage() {
  const [policies, setPolicies] = useState<PolicyState[]>([]);
  const [config, setConfig] = useState<LegalConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [workingPolicyID, setWorkingPolicyID] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiRequest<LegalConfig>("/config/legal")
      .then(async config => {
        const states = await loadPolicyPages(config.policies ?? []);
        if (!active) return;
        setConfig({
          ...config,
          policies: config.policies ?? [],
          cookie_policy_ids: config.cookie_policy_ids ?? [],
          checkout_policy_ids: config.checkout_policy_ids ?? [],
        });
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

  return (
    <ModulePageShell backTo="/" backLabel="Exit policies" width="comfortable">
      <SetupHub
        eyebrow="SITE POLICIES"
        title="Site policies"
        description="Create each policy as a custom page, then write and publish it with the existing page builder."
        action={
          policies.length > 0 ? (
            <Link className="sk-btn sk-btn--primary sk-btn--md" to="/form/site/legal/new">
              <Plus size={16} aria-hidden="true" />
              Add policy
            </Link>
          ) : undefined
        }
        progress={
          loading || loadError
            ? undefined
            : {
                completed,
                total: policies.length,
                label: "Policies configured",
                note: "Configured means the referenced custom page exists and has authored content.",
              }
        }
        busy={loading}
      >
        {loading ? (
          <p role="status">Checking legal policies…</p>
        ) : loadError ? (
          <SetupHubCallout>
            <>
              <h2>Site policy status is unavailable</h2>
              <p>Reload this page to try again.</p>
            </>
          </SetupHubCallout>
        ) : policies.length === 0 ? (
          <SetupHubCallout
            action={
              <Link className="sk-btn sk-btn--primary sk-btn--md" to="/form/site/legal/new">
                Add policy
              </Link>
            }
          >
            <>
              <h2>No policies yet</h2>
              <p>Create a policy to receive a public custom page ready for editing.</p>
            </>
          </SetupHubCallout>
        ) : (
          <SetupHubSection
            title="Policies"
            description="Open a policy to edit its referenced custom page and add interactive sections when needed."
          >
            {policies.map(({ policy, page }) => (
              <SetupHubCard
                key={policy.id}
                to={page ? `/page/${policy.page_slug}` : "/pages"}
                title={policy.name}
                description={policyDescription(policy, page)}
                icon={FileText}
                status={policyStatus(page)}
                action={
                  <>
                    <Checkbox
                      size="sm"
                      label="Cookie notice"
                      checked={config?.cookie_policy_ids.includes(policy.id) ?? false}
                      disabled={workingPolicyID !== null}
                      onChange={event => void toggleCookiePolicy(policy.id, event.target.checked)}
                    />
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={workingPolicyID !== null}
                      iconLeft={<Trash2 size={14} />}
                      onClick={() => void deletePolicy(policy)}
                    >
                      Delete
                    </Button>
                  </>
                }
              />
            ))}
          </SetupHubSection>
        )}
        <SetupHubCallout>
          <>
            <h2>Use the page primitives</h2>
            <p>
              Write the policy with normal custom-page sections. Add an interactive form only when
              you want to collect responses on the page itself; placement acceptance stays a simple
              browser-local checkbox.
            </p>
          </>
        </SetupHubCallout>
      </SetupHub>
    </ModulePageShell>
  );

  async function deletePolicy(policy: LegalPolicy) {
    if (!config) return;
    const confirmed = await customConfirm({
      title: `Delete ${policy.name}?`,
      body: "The policy page will move to Trash and its cookie/checkout placements will be removed.",
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

  async function toggleCookiePolicy(policyID: string, enabled: boolean) {
    if (!config) return;
    setWorkingPolicyID(policyID);
    try {
      await saveLegalConfig({
        ...config,
        cookie_policy_ids: enabled
          ? [...config.cookie_policy_ids, policyID]
          : config.cookie_policy_ids.filter(id => id !== policyID),
      });
      setRevision(value => value + 1);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "Cookie notice could not be updated");
    } finally {
      setWorkingPolicyID(null);
    }
  }

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

function policyStatus(page: PolicyPage | null): SetupHubStatus {
  if (!page) return { label: "Page missing", tone: "attention" };
  if (!hasAuthoredContent(page.content)) return { label: "Needs content", tone: "attention" };
  return { label: "Configured", tone: "complete" };
}

function policyDescription(policy: LegalPolicy, page: PolicyPage | null) {
  if (!page) return `${policy.description || "This policy"} no longer has its referenced page.`;
  if (!hasAuthoredContent(page.content)) {
    return policy.description || "The policy page is ready for content.";
  }
  return policy.description || "The referenced policy page contains authored sections.";
}

async function saveLegalConfig(config: LegalConfig) {
  return apiRequest<LegalConfig>("/config/legal", {
    method: "PUT",
    body: JSON.stringify(config),
  });
}
