import type { Permission, ProfileUser, Role } from "./types";

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
          You cannot modify this user — they have equal or greater power level
          than you.
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
