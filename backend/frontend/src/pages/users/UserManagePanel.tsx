import { useState } from "react";
import { apiRequest } from "../../utils/api";
import { toast } from "sonner";
import type { Permission, ProfileUser, Role } from "./types";

function SuperUsersDemotionVoteButton({
  targetUserId,
}: {
  targetUserId: string | number;
}) {
  const [loading, setLoading] = useState(false);
  const handleVote = async () => {
    if (
      !window.confirm(
        "Are you sure? more than 50% of superusers must vote to demote",
      )
    )
      return;
    setLoading(true);
    try {
      await apiRequest(`/users/${targetUserId}/superuser-sacrifice`, {
        method: "POST",
      });
      toast.success(
        "You voted to demote this superuser. If more than 50% of superusers vote, they will be demoted.",
      );
      window.location.reload();
    } catch (e) {
      toast.error(
        "Failed to cast sacrifice vote. You may have already voted, or there may be a network error.",
      );
    } finally {
      setLoading(false);
    }
  };
  return (
    <button
      className="up-sacrifice-btn"
      onClick={handleVote}
      disabled={loading}
      style={{ marginTop: 12 }}
    >
      {loading ? "Voting ..." : "Vote to Demote Superuser"}
    </button>
  );
}
interface Props {
  user: ProfileUser;
  allRoles: Role[];
  allPermissions: Permission[];
  roleTogglingSet: Set<string>;
  permTogglingSet: Set<string>;
  onRoleToggle: (name: string) => void;
  onPermissionToggle: (name: string) => void;
  /** currentUserRoles: the logged-in user's own role names, for power level comparison */
  currentUserRoles?: string[];
}

/** Compute the highest power_level among the given role names from the catalogue. */
function maxPowerLevel(roleNames: string[], allRoles: Role[]): number {
  return roleNames.reduce((max, name) => {
    const r = allRoles.find((ro) => ro.name === name);
    return r ? Math.max(max, r.power_level) : max;
  }, 0);
}

const UserManagePanel = ({
  user,
  allRoles,
  allPermissions,
  roleTogglingSet,
  permTogglingSet,
  onRoleToggle,
  onPermissionToggle,
  currentUserRoles = [],
}: Props) => {
  const actorPower = maxPowerLevel(currentUserRoles, allRoles);
  const targetPower = maxPowerLevel(user.roles ?? [], allRoles);
  const canManageTarget = actorPower > targetPower;

  const groupedPermissions = allPermissions.reduce(
    (acc, p) => {
      const cat = p.category || "General";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(p);
      return acc;
    },
    {} as Record<string, Permission[]>,
  );

  return (
    <div className="up-manage-panel">
      {!canManageTarget && (
        <div className="up-manage-notice">
          <div>
            You cannot modify this user — they have equal or greater power level
            than you ({actorPower}⚡ is not greater than {targetPower}⚡).
          </div>
          {currentUserRoles.includes("superuser") &&
            (user.roles ?? []).includes("superuser") && (
              <SuperUsersDemotionVoteButton targetUserId={user.id} />
            )}
        </div>
      )}

      {/* Roles */}
      <section className="up-manage-section">
        <h3 className="up-manage-heading">Roles</h3>
        <div className="up-checkbox-grid">
          {allRoles.map((role) => {
            const checked = (user.roles ?? []).includes(role.name);
            const toggling = roleTogglingSet.has(role.name);
            const disabled = !canManageTarget || toggling;
            return (
              <label
                key={role.id}
                className={`up-checkbox-item${checked ? " up-checkbox-checked" : ""}${toggling ? " up-checkbox-loading" : ""}${!canManageTarget ? " up-checkbox-disabled" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onRoleToggle(role.name)}
                  disabled={disabled}
                />
                <span className="up-checkbox-label">{role.name}</span>
                <span className="up-checkbox-power">⚡{role.power_level}</span>
                {role.description && (
                  <span className="up-checkbox-desc">{role.description}</span>
                )}
                {toggling && <span className="up-spinner" />}
              </label>
            );
          })}
        </div>
      </section>

      {/* Permissions */}
      <section className="up-manage-section">
        <h3 className="up-manage-heading">Permissions</h3>
        {Object.entries(groupedPermissions).map(([category, perms]) => (
          <div key={category} className="up-perm-group">
            <h4 className="up-perm-category">{category}</h4>
            <div className="up-checkbox-grid">
              {perms.map((perm) => {
                const checked = (user.permissions ?? []).includes(perm.name);
                const toggling = permTogglingSet.has(perm.name);
                const disabled = !canManageTarget || toggling;
                return (
                  <label
                    key={perm.id}
                    className={`up-checkbox-item${checked ? " up-checkbox-checked" : ""}${toggling ? " up-checkbox-loading" : ""}${!canManageTarget ? " up-checkbox-disabled" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onPermissionToggle(perm.name)}
                      disabled={disabled}
                    />
                    <span className="up-checkbox-label">{perm.name}</span>
                    {perm.description && (
                      <span className="up-checkbox-desc">
                        {perm.description}
                      </span>
                    )}
                    {toggling && <span className="up-spinner" />}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
        {allPermissions.length === 0 && (
          <p className="up-empty-hint">No permissions defined yet.</p>
        )}
      </section>
    </div>
  );
};

export default UserManagePanel;
