import React, { useState } from "react";
import { Search } from "lucide-react";
import { apiRequest } from "../../utils/api";
import SearchField from "../ui/SearchField";
import UserAvatar from "./UserAvatar";
import UserProfileOverlay from "./UserProfileOverlay";
import { useUserData } from "../../pages/users/useUserData";
import UserManagePanel from "../../pages/users/UserManagePanel";
import { useAtomValue } from "jotai";
import { currentUserAtom, hasPermissionAtom } from "../../atoms/auth";
import "../../pages/users/UserProfile.css";
import "./UserPermissionManager.css";

interface UserSearchItem {
  id: string;
  username: string;
  email: string;
  display_name: string;
  avatar_url: string;
  permissions: string[];
}

const ManageUserWrapper = ({ userId, canManage, currentUserRoles }: { userId: string, canManage: boolean, currentUserRoles: string[] }) => {
  const {
    user,
    loading,
    allPermissions,
    allRoles,
    permTogglingSet,
    roleTogglingSet,
    handlePermissionToggle,
    handleRoleToggle,
  } = useUserData(userId, canManage);

  if (loading) return <div className="upm-pane-loading"><span className="upm-spinner" /> Loading user data...</div>;
  if (!user) return <div className="upm-empty">User not found</div>;

  return (
    <div className="upm-pane-content">
      <div className="upm-pane-header">
        <UserAvatar src={user.avatar_url} alt={user.display_name || user.username} size={64} initials={(user.display_name || user.username)[0]?.toUpperCase()} />
        <div className="upm-pane-header-info">
          <h3>{user.display_name || user.username}</h3>
          <p>{user.email}</p>
        </div>
      </div>
      <UserManagePanel
        user={user}
        allRoles={allRoles}
        allPermissions={allPermissions}
        roleTogglingSet={roleTogglingSet}
        permTogglingSet={permTogglingSet}
        onRoleToggle={handleRoleToggle}
        onPermissionToggle={handlePermissionToggle}
        currentUserRoles={currentUserRoles}
      />
    </div>
  );
};

const UserPermissionManager: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchItem[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  
  const currentUser = useAtomValue(currentUserAtom);
  const hasPermission = useAtomValue(hasPermissionAtom);
  const canManage = hasPermission("user.manage-others");

  // Search users
  const handleSearch = async (query: string) => {
    setSearchQuery(query);

    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const results = await apiRequest<UserSearchItem[]>(
        `/users/search?q=${encodeURIComponent(query)}`,
        { method: "GET" },
      );
      if (results && Array.isArray(results)) {
        setSearchResults(results);
      } else {
        setSearchResults([]);
      }
    } catch (error) {
      console.error("Search failed:", error);
      setSearchResults([]);
    }
  };

  return (
    <div className="upm-app-layout">
      {/* Sidebar Area */}
      <div className="upm-sidebar">
        <div className="upm-sidebar-header">
          <h2>User Directory</h2>
          <p>Search users to manage roles and permissions.</p>
        </div>
        <div className="upm-search-container">
          <SearchField
            className="upm-search-input-wrapper"
            inputClassName="upm-search-input"
            iconSize={20}
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={handleSearch}
          />
        </div>
        <div className="upm-sidebar-results">
          {searchResults.map((user) => (
            <div
              key={user.id}
              className={`upm-list-item ${selectedUserId === user.id ? "selected" : ""}`}
              onClick={() => setSelectedUserId(user.id)}
            >
              <UserProfileOverlay userId={user.id} fallbackName={user.display_name || user.username} fallbackAvatar={user.avatar_url}>
                <div style={{ cursor: "pointer" }}>
                  <UserAvatar 
                    src={user.avatar_url} 
                    alt={user.display_name || user.username} 
                    size={40} 
                    initials={(user.display_name || user.username)[0]?.toUpperCase()}
                  />
                </div>
              </UserProfileOverlay>
              <div className="upm-list-item-info">
                <div className="upm-list-item-name">{user.display_name || user.username}</div>
                <div className="upm-list-item-email">{user.email}</div>
              </div>
            </div>
          ))}
          {searchQuery.length >= 2 && searchResults.length === 0 && (
            <div className="upm-empty-results">No users found</div>
          )}
          {searchQuery.length < 2 && searchResults.length === 0 && (
            <div className="upm-empty-results">Type at least 2 characters to search.</div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="upm-main-content">
        {selectedUserId ? (
          <ManageUserWrapper 
            userId={selectedUserId} 
            canManage={canManage} 
            currentUserRoles={currentUser?.roles ?? []} 
          />
        ) : (
          <div className="upm-placeholder">
            <Search size={48} className="upm-placeholder-icon" />
            <h3>Select a user</h3>
            <p>Search and select a user from the sidebar to view and manage their access.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserPermissionManager;
