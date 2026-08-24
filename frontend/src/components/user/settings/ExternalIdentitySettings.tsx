import { ExternalLink, Link2, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { apiRequest } from "../../../utils/api";
import Button from "../../input/Button";
import { FormSectionIntro, ManagedForm, type ManagedFormTab } from "../../form";
import { confirmDestructiveAction } from "../../ui/Prompt";
import "./ExternalIdentitySettings.css";

interface Provider {
  id: number;
  key: string;
  name: string;
  public_display_allowed: boolean;
}

interface IdentityLink {
  id: number;
  provider_id: number;
  provider_key: string;
  provider: string;
  subject: string;
  display_name: string;
  public: boolean;
  verified_at: string;
  reverified_at?: string;
}

interface Challenge {
  token: string;
  provider_key: string;
  instructions: string;
  expires_at: string;
}

interface Props {
  basePath: string;
  exitPath: string;
}

export default function ExternalIdentitySettings({ basePath, exitPath }: Props) {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [links, setLinks] = useState<IdentityLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [providerKey, setProviderKey] = useState("");
  const [subject, setSubject] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [proof, setProof] = useState("");
  const [working, setWorking] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [available, linked] = await Promise.all([
        apiRequest<Provider[]>("/external-identities/providers"),
        apiRequest<IdentityLink[]>("/external-identities/links"),
      ]);
      setProviders(available);
      setLinks(linked);
      setProviderKey(current => current || available[0]?.key || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load linked identities");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const linkedProviderIDs = useMemo(() => new Set(links.map(link => link.provider_id)), [links]);
  const hasUnlinkedProvider = providers.some(provider => !linkedProviderIDs.has(provider.id));

  const startChallenge = async () => {
    setWorking(true);
    setError("");
    try {
      const response = await apiRequest<Challenge>("/external-identities/challenges", {
        method: "POST",
        body: JSON.stringify({
          provider_key: providerKey,
          subject,
          display_name: displayName || subject,
        }),
      });
      setChallenge(response);
    } catch (challengeError) {
      setError(
        challengeError instanceof Error ? challengeError.message : "Could not begin verification"
      );
    } finally {
      setWorking(false);
    }
  };

  const completeChallenge = async () => {
    if (!challenge) return;
    setWorking(true);
    setError("");
    try {
      await apiRequest<IdentityLink>("/external-identities/challenges/complete", {
        method: "POST",
        body: JSON.stringify({ token: challenge.token, proof }),
      });
      toast.success("External identity linked");
      setChallenge(null);
      setProof("");
      setSubject("");
      setDisplayName("");
      await load();
    } catch (challengeError) {
      setError(
        challengeError instanceof Error ? challengeError.message : "Verification could not finish"
      );
    } finally {
      setWorking(false);
    }
  };

  const updateVisibility = async (link: IdentityLink) => {
    try {
      const updated = await apiRequest<IdentityLink>(
        `/external-identities/links/${link.id}/visibility`,
        { method: "PATCH", body: JSON.stringify({ public: !link.public }) }
      );
      setLinks(current => current.map(item => (item.id === updated.id ? updated : item)));
      toast.success(updated.public ? "Identity shown on your profile" : "Identity is now private");
    } catch (updateError) {
      toast.error(updateError instanceof Error ? updateError.message : "Could not update visibility");
    }
  };

  const unlink = async (link: IdentityLink) => {
    const confirmed = await confirmDestructiveAction({
      title: "Unlink external identity?",
      body: `${link.display_name} will no longer be available to your account or public profile.`,
      confirmLabel: "Unlink identity",
    });
    if (!confirmed) return;
    try {
      await apiRequest(`/external-identities/links/${link.id}`, { method: "DELETE" });
      setLinks(current => current.filter(item => item.id !== link.id));
      toast.success("External identity unlinked");
    } catch (unlinkError) {
      toast.error(unlinkError instanceof Error ? unlinkError.message : "Could not unlink identity");
    }
  };

  const tabs: ManagedFormTab[] = [
    { id: "profile", label: "Profile", icon: <UserRound size={15} />, active: false, to: `${basePath}/profile` },
    { id: "security", label: "Security", icon: <ShieldCheck size={15} />, active: false, to: `${basePath}/security` },
    { id: "identities", label: "Linked identities", icon: <Link2 size={15} />, active: true, to: `${basePath}/identities` },
  ];

  return (
    <ManagedForm<{ ready: string }>
      id="external-identity-settings-form"
      title="User Settings"
      eyebrow="Account settings"
      description="Manage settings and preferences for your account."
      initialValues={{ ready: "yes" }}
      onSubmit={async () => undefined}
      cancelTo={exitPath}
      submitLabel="Done"
      tabs={tabs}
      tabsLabel="User settings"
      formClassName="identity-settings"
    >
      <FormSectionIntro
        icon={<Link2 size={18} />}
        title="Linked identities"
        description="Connect verified accounts from services configured by this site. You control what appears publicly."
      />

      {error && <div className="managed-form__error" role="alert">{error}</div>}

      <section className="identity-settings__section" aria-labelledby="linked-identities-heading">
        <div className="identity-settings__heading">
          <div>
            <h3 id="linked-identities-heading">Your identities</h3>
            <p>Private by default. Public links show only the provider and display identity.</p>
          </div>
          <span className="identity-settings__count">{links.length}</span>
        </div>
        {loading ? (
          <div className="identity-settings__state" aria-live="polite">Loading linked identities…</div>
        ) : links.length === 0 ? (
          <div className="identity-settings__state">You have not linked an external identity yet.</div>
        ) : (
          <div className="identity-settings__list">
            {links.map(link => (
              <article className="identity-settings__item" key={link.id}>
                <div className="identity-settings__item-copy">
                  <strong>{link.display_name}</strong>
                  <span>{link.provider} · {link.public ? "Public" : "Private"}</span>
                </div>
                <div className="identity-settings__actions">
                  <Button
                    size="sm"
                    variant="action"
                    onClick={() => {
                      setProviderKey(link.provider_key);
                      setSubject(link.subject);
                      setDisplayName(link.display_name);
                      setChallenge(null);
                      setProof("");
                    }}
                  >
                    Reverify
                  </Button>
                  <Button size="sm" variant="secondary" iconLeft={<ExternalLink size={14} />} onClick={() => void updateVisibility(link)}>
                    Make {link.public ? "private" : "public"}
                  </Button>
                  <Button size="icon" variant="danger" aria-label={`Unlink ${link.display_name}`} onClick={() => void unlink(link)}>
                    <Trash2 size={15} />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="identity-settings__section" aria-labelledby="connect-identity-heading">
        <div className="identity-settings__heading">
          <div>
            <h3 id="connect-identity-heading">Connect an identity</h3>
            <p>Verification instructions come from the selected provider adapter.</p>
          </div>
        </div>
        {providers.length === 0 ? (
          <div className="identity-settings__state">No identity providers are available.</div>
        ) : challenge ? (
          <div className="identity-settings__challenge">
            <p>{challenge.instructions}</p>
            <div className="form-group">
              <label className="form-label" htmlFor="identity-proof">Verification proof</label>
              <input id="identity-proof" className="form-input" value={proof} onChange={event => setProof(event.target.value)} autoComplete="off" />
            </div>
            <div className="identity-settings__actions">
              <Button variant="secondary" onClick={() => { setChallenge(null); setProof(""); }} disabled={working}>Cancel</Button>
              <Button variant="primary" onClick={() => void completeChallenge()} loading={working} disabled={!proof.trim()}>Verify and link</Button>
            </div>
          </div>
        ) : (
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label" htmlFor="identity-provider">Provider</label>
              <select id="identity-provider" className="form-input" value={providerKey} onChange={event => setProviderKey(event.target.value)}>
                {providers.map(provider => <option key={provider.id} value={provider.key}>{provider.name}{linkedProviderIDs.has(provider.id) ? " (linked)" : ""}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="identity-subject">Account identifier</label>
              <input id="identity-subject" className="form-input" value={subject} onChange={event => setSubject(event.target.value)} maxLength={255} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="identity-display-name">Display name</label>
              <input id="identity-display-name" className="form-input" value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={120} placeholder={subject || "Name shown for this identity"} />
            </div>
            <div className="identity-settings__connect-action">
              <Button variant="primary" onClick={() => void startChallenge()} loading={working} disabled={!providerKey || !subject.trim()} iconLeft={<Link2 size={15} />}>{hasUnlinkedProvider ? "Begin verification" : "Begin reverification"}</Button>
            </div>
          </div>
        )}
      </section>
    </ManagedForm>
  );
}
