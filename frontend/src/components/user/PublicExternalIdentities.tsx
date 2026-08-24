import { Link2 } from "lucide-react";
import { useEffect, useState } from "react";
import { apiRequest } from "../../utils/api";
import "./settings/ExternalIdentitySettings.css";

interface PublicIdentity {
  provider_key: string;
  provider: string;
  display_name: string;
  verified_at: string;
}

export default function PublicExternalIdentities({ userId }: { userId: string }) {
  const [identities, setIdentities] = useState<PublicIdentity[]>([]);

  useEffect(() => {
    let active = true;
    apiRequest<PublicIdentity[]>(`/external-identities/public/users/${userId}`)
      .then(items => {
        if (active) setIdentities(items);
      })
      .catch(() => {
        if (active) setIdentities([]);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  if (identities.length === 0) return null;

  return (
    <section className="identity-settings__section up-card" aria-labelledby="public-identities-heading">
      <div className="identity-settings__heading">
        <div>
          <h3 id="public-identities-heading"><Link2 size={15} aria-hidden="true" /> Linked identities</h3>
          <p>Verified accounts this member has chosen to share.</p>
        </div>
      </div>
      <div className="identity-settings__list">
        {identities.map(identity => (
          <div className="identity-settings__item" key={`${identity.provider_key}:${identity.display_name}`}>
            <div className="identity-settings__item-copy">
              <strong>{identity.display_name}</strong>
              <span>{identity.provider}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
