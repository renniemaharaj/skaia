import { useState, useEffect } from "react";
import { apiRequest } from "../../utils/api";
import { useWebSocketSync } from "../../hooks/useWebSocketSync";
import type { ProfileUser, Permission, Role } from "./types";
import { toast } from "sonner";

export function formatDate(s: string): string {
  try {
    return new Date(s).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return "Unknown";
  }
}

export function useUserData(userId: string | undefined, canManage: boolean) {
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { subscribe, unsubscribe } = useWebSocketSync();

  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [allRoles, setAllRoles] = useState<Role[]>([]);

  const [permTogglingSet, setPermTogglingSet] = useState<Set<string>>(
    new Set(),
  );
  const [roleTogglingSet, setRoleTogglingSet] = useState<Set<string>>(
    new Set(),
  );

  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendLoading, setSuspendLoading] = useState(false);

  // Fetch user
  useEffect(() => {
    if (!userId) return;
    const fetchUser = async () => {
      setLoading(true);
      try {
        const data = await apiRequest<ProfileUser>(`/users/${userId}`);
        if (data) {
          setUser({
            ...data,
            roles: data.roles ?? [],
            permissions: data.permissions ?? [],
          });
          // Subscribe so profile changes propagate live to anyone viewing this profile
          subscribe("user", Number(userId));
        } else {
          setError("User not found");
        }
      } catch {
        setError("Failed to load user profile");
      } finally {
        setLoading(false);
      }
    };
    fetchUser();

    return () => {
      if (userId) unsubscribe("user", Number(userId));
    };
  }, [userId, subscribe, unsubscribe]);

  // Mirror real-time updates broadcast via WebSocket (avatar, banner, roles, etc.)
  useEffect(() => {
    if (!userId) return;
    const handler = (e: Event) => {
      const { userId: updatedId, user: updatedUser } = (
        e as CustomEvent<{ userId: string; user: ProfileUser }>
      ).detail;
      if (String(updatedId) === String(userId)) {
        setUser((u) =>
          u
            ? {
                ...u,
                ...updatedUser,
                roles: updatedUser.roles ?? u.roles,
                permissions: updatedUser.permissions ?? u.permissions,
              }
            : u,
        );
      }
    };
    window.addEventListener("user:profile:updated", handler);
    return () => window.removeEventListener("user:profile:updated", handler);
  }, [userId]);

  // Fetch permissions & roles catalogues
  useEffect(() => {
    if (!canManage) return;
    const fetchCatalogues = async () => {
      const [perms, roles] = await Promise.all([
        apiRequest<Permission[]>("/users/permissions").catch(
          () => [] as Permission[],
        ),
        apiRequest<Role[]>("/users/roles").catch(() => [] as Role[]),
      ]);
      setAllPermissions(perms ?? []);
      setAllRoles(roles ?? []);
    };
    fetchCatalogues();
  }, [canManage]);

  const handlePermissionToggle = async (permName: string) => {
    if (!user || !canManage || permTogglingSet.has(permName)) return;
    const hasIt = (user.permissions ?? []).includes(permName);
    setPermTogglingSet((s) => new Set(s).add(permName));
    setUser((u) =>
      u
        ? {
            ...u,
            permissions: hasIt
              ? (u.permissions ?? []).filter((p) => p !== permName)
              : [...(u.permissions ?? []), permName],
          }
        : u,
    );
    try {
      if (hasIt) {
        await apiRequest(`/users/${user.id}/permissions/${permName}`, {
          method: "DELETE",
        });
      } else {
        await apiRequest(`/users/${user.id}/permissions`, {
          method: "POST",
          body: JSON.stringify({ permission: permName }),
        });
      }
    } catch {
      setUser((u) =>
        u
          ? {
              ...u,
              permissions: hasIt
                ? [...(u.permissions ?? []), permName]
                : (u.permissions ?? []).filter((p) => p !== permName),
            }
          : u,
      );

      toast.error(`Failed to ${hasIt ? "remove" : "add"} permission`);
    } finally {
      setPermTogglingSet((s) => {
        const ns = new Set(s);
        ns.delete(permName);
        return ns;
      });
    }
  };

  const handleRoleToggle = async (roleName: string) => {
    if (!user || !canManage || roleTogglingSet.has(roleName)) return;
    const hasIt = (user.roles ?? []).includes(roleName);
    setRoleTogglingSet((s) => new Set(s).add(roleName));
    setUser((u) =>
      u
        ? {
            ...u,
            roles: hasIt
              ? (u.roles ?? []).filter((r) => r !== roleName)
              : [...(u.roles ?? []), roleName],
          }
        : u,
    );
    try {
      if (hasIt) {
        await apiRequest(`/users/${user.id}/roles/${roleName}`, {
          method: "DELETE",
        });
      } else {
        await apiRequest(`/users/${user.id}/roles`, {
          method: "POST",
          body: JSON.stringify({ role: roleName }),
        });
      }
    } catch {
      setUser((u) =>
        u
          ? {
              ...u,
              roles: hasIt
                ? [...(u.roles ?? []), roleName]
                : (u.roles ?? []).filter((r) => r !== roleName),
            }
          : u,
      );

      toast.error(
        `Failed to ${hasIt ? "remove" : "add"} role. Make sure you have sufficient permissions and power level to manage this role.`,
      );
    } finally {
      setRoleTogglingSet((s) => {
        const ns = new Set(s);
        ns.delete(roleName);
        return ns;
      });
    }
  };

  const handleSuspend = async () => {
    if (!user) return;
    setSuspendLoading(true);
    try {
      await apiRequest(`/users/${user.id}/suspend`, {
        method: "POST",
        body: JSON.stringify({ reason: suspendReason }),
      });
      setUser((u) =>
        u ? { ...u, is_suspended: true, suspended_reason: suspendReason } : u,
      );
      setSuspendDialogOpen(false);
      setSuspendReason("");
    } catch {
      toast.error("Failed to suspend user");
    } finally {
      setSuspendLoading(false);
    }
  };

  const handleUnsuspend = async () => {
    if (!user) return;
    setSuspendLoading(true);
    try {
      await apiRequest(`/users/${user.id}/suspend`, { method: "DELETE" });
      setUser((u) =>
        u ? { ...u, is_suspended: false, suspended_reason: undefined } : u,
      );
    } catch {
      toast.error("Failed to unsuspend user");
    } finally {
      setSuspendLoading(false);
    }
  };

  return {
    user,
    setUser,
    loading,
    error,
    allPermissions,
    allRoles,
    permTogglingSet,
    roleTogglingSet,
    handlePermissionToggle,
    handleRoleToggle,
    suspendDialogOpen,
    setSuspendDialogOpen,
    suspendReason,
    setSuspendReason,
    suspendLoading,
    handleSuspend,
    handleUnsuspend,
  };
}
