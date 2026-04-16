import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "../../utils/api";
import type { Permission, Role } from "../users/types";
import "./RolesManagementPage.css";

interface RoleWithPerms extends Role {
  loadedPerms?: Permission[];
  expanded?: boolean;
}

export default function RolesManagementPage() {
  const [roles, setRoles] = useState<RoleWithPerms[]>([]);
  const [allPerms, setAllPerms] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createPower, setCreatePower] = useState(0);
  const [creating, setCreating] = useState(false);

  // Per-role edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPower, setEditPower] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Per-role permission toggling
  const [permToggling, setPermToggling] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [fetchedRoles, fetchedPerms] = await Promise.all([
          apiRequest<Role[]>("/roles"),
          apiRequest<Permission[]>("/permissions"),
        ]);
        setRoles(
          (fetchedRoles ?? []).map((r) => ({
            ...r,
            loadedPerms: undefined,
            expanded: false,
          })),
        );
        setAllPerms(fetchedPerms ?? []);
      } catch {
        setError("Failed to load roles");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const loadRolePerms = async (roleId: string) => {
    const perms = await apiRequest<Permission[]>(
      `/roles/${roleId}/permissions`,
    );
    setRoles((rs) =>
      rs.map((r) => (r.id === roleId ? { ...r, loadedPerms: perms ?? [] } : r)),
    );
  };

  const toggleExpand = async (roleId: string) => {
    const role = roles.find((r) => r.id === roleId);
    if (!role) return;
    const nowExpanded = !role.expanded;
    setRoles((rs) =>
      rs.map((r) => (r.id === roleId ? { ...r, expanded: nowExpanded } : r)),
    );
    if (nowExpanded && role.loadedPerms === undefined) {
      await loadRolePerms(roleId);
    }
  };

  const startEdit = (role: RoleWithPerms) => {
    setEditingId(role.id);
    setEditName(role.name);
    setEditDesc(role.description);
    setEditPower(role.power_level);
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (roleId: string) => {
    setSavingId(roleId);
    try {
      const updated = await apiRequest<Role>(`/roles/${roleId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: editName,
          description: editDesc,
          power_level: editPower,
        }),
      });
      if (updated) {
        setRoles((rs) =>
          rs.map((r) => (r.id === roleId ? { ...r, ...updated } : r)),
        );
        toast.success("Role updated");
        setEditingId(null);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to update role";
      toast.error(msg);
    } finally {
      setSavingId(null);
    }
  };

  const deleteRole = async (roleId: string) => {
    if (!confirm("Delete this role? Users with only this role will lose it."))
      return;
    setDeletingId(roleId);
    try {
      await apiRequest(`/roles/${roleId}`, { method: "DELETE" });
      setRoles((rs) => rs.filter((r) => r.id !== roleId));
      toast.success("Role deleted");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to delete role";
      toast.error(msg);
    } finally {
      setDeletingId(null);
    }
  };

  const createRole = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const role = await apiRequest<Role>("/roles", {
        method: "POST",
        body: JSON.stringify({
          name: createName.trim(),
          description: createDesc,
          power_level: createPower,
        }),
      });
      if (role) {
        setRoles((rs) => [
          { ...role, loadedPerms: [], expanded: false },
          ...rs,
        ]);
        toast.success("Role created");
        setCreateName("");
        setCreateDesc("");
        setCreatePower(0);
        setShowCreate(false);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to create role";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const toggleRolePerm = async (
    roleId: string,
    permName: string,
    currentlyHas: boolean,
  ) => {
    const key = `${roleId}:${permName}`;
    if (permToggling.has(key)) return;
    setPermToggling((s) => new Set(s).add(key));
    // Optimistic update
    setRoles((rs) =>
      rs.map((r) => {
        if (r.id !== roleId || !r.loadedPerms) return r;
        return {
          ...r,
          loadedPerms: currentlyHas
            ? r.loadedPerms.filter((p) => p.name !== permName)
            : [
                ...r.loadedPerms,
                allPerms.find((p) => p.name === permName)!,
              ].filter(Boolean),
        };
      }),
    );
    try {
      if (currentlyHas) {
        await apiRequest(
          `/roles/${roleId}/permissions/${encodeURIComponent(permName)}`,
          { method: "DELETE" },
        );
      } else {
        await apiRequest(`/roles/${roleId}/permissions`, {
          method: "POST",
          body: JSON.stringify({ permission: permName }),
        });
      }
    } catch {
      // Revert
      setRoles((rs) =>
        rs.map((r) => {
          if (r.id !== roleId || !r.loadedPerms) return r;
          return {
            ...r,
            loadedPerms: currentlyHas
              ? [
                  ...r.loadedPerms,
                  allPerms.find((p) => p.name === permName)!,
                ].filter(Boolean)
              : r.loadedPerms.filter((p) => p.name !== permName),
          };
        }),
      );
      toast.error("Failed to update permission");
    } finally {
      setPermToggling((s) => {
        const ns = new Set(s);
        ns.delete(key);
        return ns;
      });
    }
  };

  const groupedPerms = allPerms.reduce(
    (acc, p) => {
      const cat = p.category || "General";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(p);
      return acc;
    },
    {} as Record<string, Permission[]>,
  );

  if (loading)
    return <div className="rmp-container rmp-state">Loading roles…</div>;
  if (error)
    return (
      <div className="rmp-container rmp-state rmp-state--error">{error}</div>
    );

  return (
    <div className="rmp-container">
      <div className="rmp-header">
        <div>
          <h1 className="rmp-title">Roles</h1>
          <p className="rmp-subtitle">
            Manage roles and their permissions. Power level determines hierarchy
            — a user can only manage others with a lower power level.
          </p>
        </div>
        <button
          className="btn btn-primary rmp-create-btn"
          onClick={() => setShowCreate((v) => !v)}
        >
          <Plus size={16} />
          New Role
        </button>
      </div>

      {showCreate && (
        <div className="card rmp-create-card">
          <h3 className="rmp-section-heading">Create Role</h3>
          <div className="rmp-form-row">
            <div className="rmp-field">
              <label className="rmp-label">Name</label>
              <input
                className="rmp-input"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. moderator"
              />
            </div>
            <div className="rmp-field rmp-field--narrow">
              <label className="rmp-label">Power Level</label>
              <input
                className="rmp-input"
                type="number"
                min={0}
                value={createPower}
                onChange={(e) => setCreatePower(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="rmp-field">
            <label className="rmp-label">Description</label>
            <input
              className="rmp-input"
              value={createDesc}
              onChange={(e) => setCreateDesc(e.target.value)}
              placeholder="Optional description"
            />
          </div>
          <div className="rmp-form-actions">
            <button
              className="btn btn-secondary"
              onClick={() => setShowCreate(false)}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={createRole}
              disabled={creating || !createName.trim()}
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      )}

      <div className="rmp-list">
        {roles.length === 0 && (
          <div className="rmp-empty">No roles defined yet.</div>
        )}
        {roles.map((role) => {
          const isEditing = editingId === role.id;
          const isSaving = savingId === role.id;
          const isDeleting = deletingId === role.id;

          return (
            <div key={role.id} className="card rmp-role-card">
              {/* Role header */}
              <div className="rmp-role-header">
                <div className="rmp-role-meta">
                  {isEditing ? (
                    <div className="rmp-edit-row">
                      <input
                        className="rmp-input rmp-input--name"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Role name"
                      />
                      <input
                        className="rmp-input rmp-input--desc"
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        placeholder="Description"
                      />
                      <div className="rmp-power-field">
                        <span className="rmp-label">Power</span>
                        <input
                          className="rmp-input rmp-input--power"
                          type="number"
                          min={0}
                          value={editPower}
                          onChange={(e) => setEditPower(Number(e.target.value))}
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="rmp-role-name">{role.name}</span>
                      {role.description && (
                        <span className="rmp-role-desc">
                          {role.description}
                        </span>
                      )}
                      <span className="rmp-power-badge">
                        ⚡ {role.power_level}
                      </span>
                    </>
                  )}
                </div>
                <div className="rmp-role-actions">
                  {isEditing ? (
                    <>
                      <button
                        className="btn btn-primary rmp-action-btn"
                        onClick={() => saveEdit(role.id)}
                        disabled={isSaving}
                      >
                        <Save size={14} />
                        {isSaving ? "Saving…" : "Save"}
                      </button>
                      <button
                        className="btn btn-secondary rmp-action-btn"
                        onClick={cancelEdit}
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn btn-secondary rmp-action-btn"
                        onClick={() => startEdit(role)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn rmp-action-btn rmp-delete-btn"
                        onClick={() => deleteRole(role.id)}
                        disabled={isDeleting}
                      >
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                  <button
                    className="btn btn-secondary rmp-action-btn rmp-expand-btn"
                    onClick={() => toggleExpand(role.id)}
                  >
                    {role.expanded ? (
                      <ChevronUp size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}
                    Permissions
                  </button>
                </div>
              </div>

              {/* Expanded permissions */}
              {role.expanded && (
                <div className="rmp-perms-panel">
                  {role.loadedPerms === undefined ? (
                    <div className="rmp-perms-loading">
                      Loading permissions…
                    </div>
                  ) : (
                    Object.entries(groupedPerms).map(([category, perms]) => (
                      <div key={category} className="rmp-perm-group">
                        <h4 className="rmp-perm-category">{category}</h4>
                        <div className="rmp-perm-grid">
                          {perms.map((perm) => {
                            const hasIt = role.loadedPerms!.some(
                              (p) => p.name === perm.name,
                            );
                            const toggling = permToggling.has(
                              `${role.id}:${perm.name}`,
                            );
                            return (
                              <label
                                key={perm.id}
                                className={`rmp-perm-item${hasIt ? " rmp-perm-checked" : ""}${toggling ? " rmp-perm-toggling" : ""}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={hasIt}
                                  onChange={() =>
                                    toggleRolePerm(role.id, perm.name, hasIt)
                                  }
                                  disabled={toggling}
                                />
                                <span className="rmp-perm-name">
                                  {perm.name}
                                </span>
                                {perm.description && (
                                  <span className="rmp-perm-desc">
                                    {perm.description}
                                  </span>
                                )}
                                {toggling && <span className="up-spinner" />}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                  {allPerms.length === 0 && (
                    <p className="rmp-empty">No permissions defined.</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
