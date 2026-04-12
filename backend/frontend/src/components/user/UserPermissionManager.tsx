import React, { useState, useEffect } from "react";
import { Search, X, Check } from "lucide-react";
import { apiRequest } from "../../utils/api";
import "./UserPermissionManager.css";

interface User {
  id: string;
  username: string;
  email: string;
  display_name: string;
  permissions: string[];
}

interface Permission {
  id: string;
  name: string;
  category: string;
  description: string;
}

const UserPermissionManager: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [permissionChanges, setPermissionChanges] = useState<Set<string>>(
    new Set(),
  );

  // Fetch permissions on mount
  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        const data = await apiRequest<Permission[]>("/permissions", {
          method: "GET",
        });
        if (data && Array.isArray(data)) {
          setPermissions(data);
        } else {
          setPermissions([]);
        }
      } catch (error) {
        console.error("Failed to fetch permissions:", error);
      }
    };

    fetchPermissions();
  }, []);

  // Search users
  const handleSearch = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const results = await apiRequest<User[]>(
        `/users/search?q=${encodeURIComponent(query)}`,
        { method: "GET" },
      );
      if (results && Array.isArray(results)) {
        setSearchResults(
          results.map((user) => ({
            ...user,
            permissions: user.permissions || [],
          })),
        );
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error("Search failed:", error);
      setSearchResults([]);
    }
  };

  // Open dialog to manage user
  const handleManageClick = (user: User) => {
    setSelectedUser(user);
    setPermissionChanges(new Set());
    setShowDialog(true);
  };

  // Toggle permission
  const handlePermissionToggle = (permissionName: string) => {
    const newChanges = new Set(permissionChanges);
    if (newChanges.has(permissionName)) {
      newChanges.delete(permissionName);
    } else {
      newChanges.add(permissionName);
    }
    setPermissionChanges(newChanges);
  };

  // Save permission changes
  const handleSavePermissions = async () => {
    if (!selectedUser) return;

    setIsLoading(true);
    try {
      for (const permissionName of permissionChanges) {
        const hasPermission = (selectedUser.permissions ?? []).includes(
          permissionName,
        );

        if (hasPermission) {
          // Remove permission
          await apiRequest(
            `/users/${selectedUser.id}/permissions/${permissionName}`,
            { method: "DELETE" },
          );
        } else {
          // Add permission
          await apiRequest(`/users/${selectedUser.id}/permissions`, {
            method: "POST",
            body: JSON.stringify({
              permission: permissionName,
            }),
          });
        }
      }

      // Update selected user
      const updatedUser = await apiRequest<User>(`/users/${selectedUser.id}`, {
        method: "GET",
      });
      if (updatedUser) {
        const normalizedUser = {
          ...updatedUser,
          permissions: updatedUser.permissions || [],
        };
        setSelectedUser(normalizedUser);
        // Update in search results
        setSearchResults(
          searchResults.map((u) =>
            u.id === normalizedUser.id ? normalizedUser : u,
          ),
        );
      }

      setPermissionChanges(new Set());
    } catch (error) {
      console.error("Failed to save permissions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Check if permission is currently assigned (considering changes)
  const hasPermission = (permissionName: string) => {
    if (!selectedUser) return false;
    const isChanging = permissionChanges.has(permissionName);
    const userPermissions = selectedUser.permissions || [];
    const currentlyHas = userPermissions.includes(permissionName);
    return isChanging ? !currentlyHas : currentlyHas;
  };

  // Group permissions by category
  const groupedPermissions = permissions.reduce(
    (acc, perm) => {
      if (!acc[perm.category]) {
        acc[perm.category] = [];
      }
      acc[perm.category].push(perm);
      return acc;
    },
    {} as Record<string, Permission[]>,
  );

  return (
    <div className="user-permission-manager">
      <div className="upm-header">
        <h2>Manage User Permissions</h2>
      </div>

      {/* Search section */}
      <div className="upm-search-container">
        <div className="upm-search-input-wrapper">
          <Search size={20} />
          <input
            type="text"
            placeholder="Search users by name or email..."
            value={searchQuery}
            onChange={handleSearch}
            className="upm-search-input"
          />
        </div>
      </div>

      {/* Results section */}
      {searchResults.length > 0 && (
        <div className="upm-results">
          {searchResults.map((user) => (
            <div
              key={user.id}
              className="card card--interactive card--compact upm-user-card"
            >
              <div className="upm-user-info">
                <div className="upm-user-name">
                  {user.display_name || user.username}
                </div>
                <div className="upm-user-email">{user.email}</div>
                <div className="upm-user-perms">
                  {(user.permissions?.length ?? 0) > 0 ? (
                    <span className="upm-perm-count">
                      {user.permissions?.length ?? 0} permissions
                    </span>
                  ) : (
                    <span className="upm-perm-count empty">No permissions</span>
                  )}
                </div>
              </div>
              <button
                className="upm-manage-btn"
                onClick={() => handleManageClick(user)}
              >
                Manage
              </button>
            </div>
          ))}
        </div>
      )}

      {searchQuery.length >= 2 && searchResults.length === 0 && (
        <div className="upm-empty">No users found</div>
      )}

      {/* Permission management dialog */}
      {showDialog && selectedUser && (
        <div
          className="upm-dialog-overlay"
          onClick={() => setShowDialog(false)}
        >
          <div
            className="upm-dialog card card--outlined"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="upm-dialog-header">
              <div>
                <h3>{selectedUser.display_name || selectedUser.username}</h3>
                <p>{selectedUser.email}</p>
              </div>
              <button
                className="upm-dialog-close"
                onClick={() => setShowDialog(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="upm-dialog-content">
              {Object.entries(groupedPermissions).map(([category, perms]) => (
                <div key={category} className="upm-permission-group">
                  <div className="upm-category-title">{category}</div>
                  <div className="upm-permissions-list">
                    {perms.map((perm) => (
                      <label key={perm.id} className="upm-permission-item">
                        <input
                          type="checkbox"
                          checked={hasPermission(perm.name)}
                          onChange={() => handlePermissionToggle(perm.name)}
                          disabled={isLoading}
                        />
                        <span className="upm-perm-name">{perm.name}</span>
                        <span className="upm-perm-desc">
                          {perm.description}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="upm-dialog-footer">
              <button
                className="upm-cancel-btn"
                onClick={() => setShowDialog(false)}
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                className="upm-save-btn"
                onClick={handleSavePermissions}
                disabled={isLoading || permissionChanges.size === 0}
              >
                {isLoading ? (
                  <>
                    <span className="upm-spinner"></span>
                    Saving...
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserPermissionManager;
