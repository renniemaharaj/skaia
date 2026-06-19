import { useSetAtom } from "jotai";
import { ChevronDown, ChevronUp, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { User } from "../../atoms/auth";
import { layoutModeAtom } from "../../atoms/layoutMode";
import { apiRequest } from "../../utils/api";
import PersonPicker from "../ui/PersonPicker";
import { customConfirm } from "../ui/Prompt";
import UserAvatar from "../user/UserAvatar";
import UserProfileOverlay from "../user/UserProfileOverlay";
import type { Permission, ProfileUser, Role } from "../user/types";
import "./RolesManagementPage.css";
import Button from "../input/Button";
import Checkbox from "../input/Checkbox";
import { SideRouteShell } from "../layout/SideRouteShell";
import { ContentFlatCard } from "../cards/ContentFlatCard";

interface RoleWithPerms extends Role {
  loadedPerms?: Permission[];
  loadedUsers?: ProfileUser[];
  permsExpanded?: boolean;
  usersExpanded?: boolean;
}

export default function RolesManagementPage() {
  const setLayoutMode = useSetAtom(layoutModeAtom);
  const [roles, setRoles] = useState<RoleWithPerms[]>([]);
  const [allPerms, setAllPerms] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createPower, setCreatePower] = useState(0);
  const [createThemeColor, setCreateThemeColor] = useState("");
  const [createStorageBonus, setCreateStorageBonus] = useState(0);
  const [creating, setCreating] = useState(false);

  // Per-role edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPower, setEditPower] = useState(0);
  const [editThemeColor, setEditThemeColor] = useState("");
  const [editStorageBonus, setEditStorageBonus] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Per-role permission toggling
  const [permToggling, setPermToggling] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLayoutMode("application");
    return () => setLayoutMode("web");
  }, [setLayoutMode]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [fetchedRoles, fetchedPerms] = await Promise.all([
          apiRequest<Role[]>("/users/roles"),
          apiRequest<Permission[]>("/users/permissions"),
        ]);
        setRoles(
					(fetchedRoles ?? []).map((r) => ({
            ...r,
            loadedPerms: undefined,
            loadedUsers: undefined,
            permsExpanded: false,
            usersExpanded: false,
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
			`/users/roles/${roleId}/permissions`,
		);
		setRoles((rs) =>
			rs.map((r) => (r.id === roleId ? { ...r, loadedPerms: perms ?? [] } : r)),
		);
  };

	const removeUserFromRole = async (
		roleId: string,
		roleName: string,
		userId: string,
	) => {
    try {
      await apiRequest(`/users/${userId}/roles/${roleName}`, {
        method: "DELETE",
      });
			setRoles((rs) =>
				rs.map((r) => {
          if (r.id !== roleId || !r.loadedUsers) return r;
          return {
            ...r,
						loadedUsers: r.loadedUsers.filter(
							(u) => String(u.id) !== String(userId),
						),
          };
				}),
      );
      toast.success("User removed from role");
    } catch (e) {
      toast.error("Failed to remove user");
    }
  };

	const addUserToRole = async (
		roleId: string,
		roleName: string,
		user: ProfileUser | User,
	) => {
    try {
      await apiRequest(`/users/${user.id}/roles`, {
        method: "POST",
        body: JSON.stringify({ role: roleName }),
      });
			setRoles((rs) =>
				rs.map((r) => {
          if (r.id !== roleId || !r.loadedUsers) return r;
					if (r.loadedUsers.some((u) => String(u.id) === String(user.id)))
						return r;
          return { ...r, loadedUsers: [...r.loadedUsers, user as ProfileUser] };
				}),
      );
      toast.success("User added to role");
    } catch (e) {
      toast.error("Failed to add user");
    }
  };

	const [expandedEditSection, setExpandedEditSection] = useState<string | null>(
		"display",
	);

  const startEdit = (role: RoleWithPerms) => {
    setEditingId(role.id);
    setEditName(role.name);
    setEditDesc(role.description);
    setEditPower(role.power_level);
    setEditThemeColor(role.theme_color || "");
    setEditStorageBonus(role.storage_bonus || 0);
    setExpandedEditSection("display");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setExpandedEditSection(null);
  };

  const toggleEditSection = async (roleId: string, section: string) => {
    const isExpanding = expandedEditSection !== section;
    setExpandedEditSection(isExpanding ? section : null);

    if (isExpanding) {
			const role = roles.find((r) => r.id === roleId);
      if (role) {
        if (section === "permissions" && role.loadedPerms === undefined) {
          await loadRolePerms(roleId);
        }
        if (section === "users" && role.loadedUsers === undefined) {
          try {
						const users = await apiRequest<ProfileUser[]>(
							`/users/roles/${roleId}/users`,
						);
						setRoles((rs) =>
							rs.map((r) =>
								r.id === roleId ? { ...r, loadedUsers: users || [] } : r,
							),
						);
          } catch (e) {
            toast.error("Failed to load users for role");
          }
        }
      }
    }
  };

  const saveEdit = async (roleId: string) => {
    setSavingId(roleId);
    try {
      const updated = await apiRequest<Role>(`/users/roles/${roleId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: editName,
          description: editDesc,
          power_level: editPower,
          theme_color: editThemeColor || undefined,
          storage_bonus: editStorageBonus,
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
		if (
			!(await customConfirm(
				"Delete this role? Users with only this role will lose it.",
			))
		)
			return;
    setDeletingId(roleId);
    try {
      await apiRequest(`/users/roles/${roleId}`, { method: "DELETE" });
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
      const role = await apiRequest<Role>("/users/roles", {
        method: "POST",
        body: JSON.stringify({
          name: createName.trim(),
          description: createDesc,
          power_level: createPower,
          theme_color: createThemeColor || undefined,
          storage_bonus: createStorageBonus,
        }),
      });
      if (role) {
				setRoles((rs) => [
          {
            ...role,
            loadedPerms: [],
            loadedUsers: [],
            permsExpanded: false,
            usersExpanded: false,
          },
          ...rs,
        ]);
        toast.success("Role created");
        setCreateName("");
        setCreateDesc("");
        setCreatePower(0);
        setCreateThemeColor("");
        setCreateStorageBonus(0);
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
					`/users/roles/${roleId}/permissions/${encodeURIComponent(permName)}`,
					{
          method: "DELETE",
					},
				);
      } else {
        // This is the correct
				await apiRequest(
					`/users/roles/${roleId}/permissions/${encodeURIComponent(permName)}`,
					{
          method: "POST",
          body: JSON.stringify({ permission: permName }),
					},
				);
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
    return (
      <SideRouteShell title="Roles" backTo="/" backLabel="Exit">
        <div className="rmp-state">Loading roles...</div>
      </SideRouteShell>
    );
  if (error)
    return (
      <SideRouteShell title="Roles" backTo="/" backLabel="Exit">
        <div className="rmp-state rmp-state--error">{error}</div>
      </SideRouteShell>
    );

  return (
    <SideRouteShell
      title="Roles"
      subtitle="Manage roles and their permissions. Power level determines hierarchy - a user can only manage others with a lower power level."
      backTo="/"
      backLabel="Exit"
      className="rmp-shell"
      contentClassName="rmp-shell__content"
      actions={
        <Button
          variant="ghost"
          size="sm"
          className="rmp-create-btn"
					onClick={() => setShowCreate((v) => !v)}
          iconLeft={<Plus size={16} />}
        >
          New Role
        </Button>
      }
    >
      {showCreate && (
				<ContentFlatCard className="rmp-create-card">
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
            <div className="rmp-field rmp-field--narrow">
              <label className="rmp-label">Color</label>
							<div
								style={{ display: "flex", gap: "8px", alignItems: "center" }}
							>
                <input
                  type="color"
                  className="rmp-color-input"
                  value={createThemeColor || "#ffffff"}
									onChange={(e) => setCreateThemeColor(e.target.value)}
                />
                <Button
                  variant="action"
                  size="sm"
                  onClick={() => setCreateThemeColor("")}
                  style={{ padding: "4px 8px", fontSize: "12px" }}
                >
                  Clear
                </Button>
              </div>
            </div>
            <div className="rmp-field rmp-field--narrow">
              <label className="rmp-label">Storage Bonus (bytes)</label>
              <input
                className="rmp-input"
                type="number"
                min={0}
                value={createStorageBonus}
								onChange={(e) => setCreateStorageBonus(Number(e.target.value))}
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
            <Button variant="action" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={createRole}
              disabled={!createName.trim()}
              loading={creating}
            >
              Create
            </Button>
          </div>
				</ContentFlatCard>
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
						<ContentFlatCard key={role.id} className="rmp-role-card">
              {/* Role header */}
              <div className="rmp-role-header">
                <div className="rmp-role-meta">
									<span
										className="rmp-role-name"
										style={{ color: role.theme_color || "inherit" }}
									>
                    {role.name}
                  </span>
									{role.description && (
										<span className="rmp-role-desc">{role.description}</span>
									)}
                  <span className="rmp-power-badge">⚡ {role.power_level}</span>
                  {role.storage_bonus > 0 && (
										<span
											className="rmp-power-badge"
											style={{ background: "var(--bg-tertiary)" }}
										>
                      💾 +{(role.storage_bonus / (1024 * 1024)).toFixed(0)} MB
                    </span>
                  )}
                </div>
                <div className="rmp-role-actions">
                  {isEditing ? (
                    <Button
                      variant="action"
                      size="sm"
                      className="rmp-action-btn"
                      onClick={cancelEdit}
                      iconLeft={<X size={14} />}
                    />
                  ) : (
                    <>
                      <Button
                        variant="action"
                        size="sm"
                        className="rmp-action-btn"
                        onClick={() => startEdit(role)}
                      >
                        Manage Role
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        className="rmp-action-btn danger"
                        onClick={() => deleteRole(role.id)}
                        disabled={isDeleting}
                        iconLeft={<Trash2 size={14} />}
                      />
                    </>
                  )}
                </div>
              </div>

              {/* Edit sections */}
              {isEditing && (
                <div
                  className="rmp-edit-menu"
                  style={{
                    borderTop: "1px solid var(--border-color)",
                    background: "var(--bg-tertiary)",
                    borderRadius: "0 0 12px 12px",
                    overflow: "hidden",
                    marginTop: "1rem",
                  }}
                >
                  {/* Role Display */}
                  <div className="rmp-edit-section">
                    <button
                      className="rmp-section-header"
                      style={{
                        width: "100%",
                        padding: "1rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--text-primary)",
                        fontWeight: 600,
                      }}
                      onClick={() => toggleEditSection(role.id, "display")}
                    >
                      <span>Role Display</span>
                      {expandedEditSection === "display" ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </button>
                    {expandedEditSection === "display" && (
                      <div
                        className="rmp-form-row"
                        style={{
                          padding: "0 1rem 1rem 1rem",
                          width: "100%",
                          flexWrap: "wrap",
                        }}
                      >
                        <div className="rmp-field">
                          <label className="rmp-label">Name</label>
                          <input
                            className="rmp-input"
                            value={editName}
														onChange={(e) => setEditName(e.target.value)}
                            placeholder="Role name"
                          />
                        </div>
                        <div className="rmp-field">
                          <label className="rmp-label">Description</label>
                          <input
                            className="rmp-input"
                            value={editDesc}
														onChange={(e) => setEditDesc(e.target.value)}
                            placeholder="Description"
                          />
                        </div>
                        <div className="rmp-field rmp-field--narrow">
                          <label className="rmp-label">Color</label>
                          <div
                            style={{
                              display: "flex",
                              gap: "8px",
                              alignItems: "center",
                            }}
                          >
                            <input
                              type="color"
                              className="rmp-color-input"
                              value={editThemeColor || "#ffffff"}
															onChange={(e) =>
																setEditThemeColor(e.target.value)
															}
                            />
                            <Button
                              variant="action"
                              size="sm"
                              onClick={() => setEditThemeColor("")}
                              style={{ padding: "4px 8px", fontSize: "12px" }}
                            >
                              Clear
                            </Button>
                          </div>
                        </div>
                        <div
                          style={{
                            width: "100%",
                            display: "flex",
                            justifyContent: "flex-end",
                            marginTop: "0.5rem",
                          }}
                        >
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => saveEdit(role.id)}
                            loading={isSaving}
                            iconLeft={<Save size={14} />}
                          >
                            Save Changes
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Features & Storage */}
                  <div
                    className="rmp-edit-section"
                    style={{ borderTop: "1px solid var(--border-color)" }}
                  >
                    <button
                      className="rmp-section-header"
                      style={{
                        width: "100%",
                        padding: "1rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--text-primary)",
                        fontWeight: 600,
                      }}
                      onClick={() => toggleEditSection(role.id, "features")}
                    >
                      <span>Features & Storage</span>
                      {expandedEditSection === "features" ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </button>
                    {expandedEditSection === "features" && (
                      <div
                        className="rmp-form-row"
                        style={{
                          padding: "0 1rem 1rem 1rem",
                          width: "100%",
                          flexWrap: "wrap",
                        }}
                      >
                        <div className="rmp-field rmp-field--narrow">
                          <label className="rmp-label">Power Level</label>
                          <input
                            className="rmp-input"
                            type="number"
                            min={0}
                            value={editPower}
														onChange={(e) =>
															setEditPower(Number(e.target.value))
														}
                          />
                        </div>
                        <div className="rmp-field rmp-field--narrow">
													<label className="rmp-label">
														Storage Bonus (bytes)
													</label>
                          <input
                            className="rmp-input"
                            type="number"
                            min={0}
                            value={editStorageBonus}
														onChange={(e) =>
															setEditStorageBonus(Number(e.target.value))
														}
                          />
                        </div>
                        <div
                          style={{
                            width: "100%",
                            display: "flex",
                            justifyContent: "flex-end",
                            marginTop: "0.5rem",
                          }}
                        >
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => saveEdit(role.id)}
                            loading={isSaving}
                            iconLeft={<Save size={14} />}
                          >
                            Save Changes
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Permissions */}
                  <div
                    className="rmp-edit-section"
                    style={{ borderTop: "1px solid var(--border-color)" }}
                  >
                    <button
                      className="rmp-section-header"
                      style={{
                        width: "100%",
                        padding: "1rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--text-primary)",
                        fontWeight: 600,
                      }}
                      onClick={() => toggleEditSection(role.id, "permissions")}
                    >
                      <span>Permissions</span>
                      {expandedEditSection === "permissions" ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </button>
                    {expandedEditSection === "permissions" && (
											<div
												className="rmp-perms-panel"
												style={{ padding: "0 1rem 1rem 1rem" }}
											>
                        {role.loadedPerms === undefined ? (
													<div className="rmp-perms-loading">
														Loading permissions…
													</div>
                        ) : (
													Object.entries(groupedPerms).map(
														([category, perms]) => (
                            <div key={category} className="rmp-perm-group">
																<h4 className="rmp-perm-category">
																	{category}
																</h4>
                              <div className="rmp-perm-grid">
																	{perms.map((perm) => {
                                  const hasIt =
																			role.loadedPerms?.some(
																				(p) => p.name === perm.name,
																			) ?? false;
																		const toggling = permToggling.has(
																			`${role.id}:${perm.name}`,
																		);
                                  return (
                                    <label
                                      key={perm.id}
                                      className={`rmp-perm-item${hasIt ? " rmp-perm-checked" : ""}${toggling ? " rmp-perm-toggling" : ""}`}
                                    >
                                      <Checkbox
                                        checked={hasIt}
																					onChange={() =>
																						toggleRolePerm(
																							role.id,
																							perm.name,
																							hasIt,
																						)
																					}
                                        disabled={toggling}
                                        size="sm"
                                      />
																				<span className="rmp-perm-name">
																					{perm.name}
																				</span>
                                      {perm.description && (
																					<span className="rmp-perm-desc">
																						{perm.description}
																					</span>
																				)}
																				{toggling && (
																					<span className="up-spinner" />
                                      )}
                                    </label>
                                  );
                                })}
                              </div>
                            </div>
														),
													)
                        )}
                        {allPerms.length === 0 && (
                          <p className="rmp-empty">No permissions defined.</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Users */}
                  <div
                    className="rmp-edit-section"
                    style={{ borderTop: "1px solid var(--border-color)" }}
                  >
                    <button
                      className="rmp-section-header"
                      style={{
                        width: "100%",
                        padding: "1rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--text-primary)",
                        fontWeight: 600,
                      }}
                      onClick={() => toggleEditSection(role.id, "users")}
                    >
                      <span>Assigned Users</span>
                      {expandedEditSection === "users" ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </button>
                    {expandedEditSection === "users" && (
											<div
												className="rmp-perms-panel"
												style={{ padding: "0 1rem 1rem 1rem" }}
											>
												<div
													style={{ marginBottom: "1.5rem", maxWidth: "350px" }}
												>
                          <label
                            className="rmp-label"
                            style={{ display: "block", marginBottom: "0.5rem" }}
                          >
                            Add user to role
                          </label>
                          <PersonPicker
														onSelect={(user) =>
															addUserToRole(role.id, role.name, user)
														}
														excludeIds={
															role.loadedUsers?.map((u) => u.id) || []
														}
                            excludeSelf={false}
                            placeholder="Search users..."
                            autoFocus={false}
                          />
                        </div>
                        {role.loadedUsers === undefined ? (
													<div className="rmp-perms-loading">
														Loading users…
													</div>
                        ) : role.loadedUsers.length === 0 ? (
                          <p className="rmp-empty" style={{ margin: 0 }}>
                            No users assigned to this role.
                          </p>
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "0.5rem",
                            }}
                          >
														{role.loadedUsers.map((u) => (
                              <div key={u.id} className="rmp-user-badge">
                                <UserProfileOverlay
                                  userId={u.id}
                                  fallbackName={u.display_name || u.username}
                                  fallbackAvatar={u.avatar_url || undefined}
                                >
                                  <UserAvatar
                                    src={u.avatar_url || undefined}
                                    alt={u.display_name || u.username}
                                    size={24}
																		initials={(u.display_name ||
																			u.username)?.[0]?.toUpperCase()}
                                  />
                                </UserProfileOverlay>
                                <span
                                  className="rmp-user-badge-name"
                                  title={u.display_name || u.username}
                                >
                                  {u.display_name || u.username}
                                </span>
                                <button
                                  className="rmp-user-badge-remove"
                                  onClick={() =>
																		removeUserFromRole(
																			role.id,
																			role.name,
																			String(u.id),
																		)
                                  }
                                  title={`Remove ${u.display_name || u.username} from ${role.name}`}
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
						</ContentFlatCard>
          );
        })}
      </div>
    </SideRouteShell>
  );
}
