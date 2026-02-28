import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { apiRequest } from "../../utils/api";
import "./UserProfile.css";

interface User {
  id: string;
  username: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  banner_url?: string;
  bio?: string;
  permissions: string[];
  roles: string[];
  created_at: string;
}

const UserProfile: React.FC = () => {
  const { userId } = useParams<{ userId: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      if (!userId) {
        setError("No user ID provided");
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const userData = await apiRequest<User>(`/users/${userId}`, {
          method: "GET",
        });
        if (userData) {
          setUser({
            ...userData,
            roles: userData.roles || [],
            permissions: userData.permissions || [],
          });
          setError(null);
        } else {
          setError("User not found");
        }
      } catch (err) {
        console.error("Failed to fetch user:", err);
        setError("Failed to load user profile");
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [userId]);

  if (loading) {
    return (
      <div className="user-profile-container loading">
        Loading user profile...
      </div>
    );
  }

  if (error) {
    return <div className="user-profile-container error">{error}</div>;
  }

  if (!user) {
    return <div className="user-profile-container error">User not found</div>;
  }

  const createdDate = new Date(user.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="user-profile-container">
      <div className="user-profile">
        {user.banner_url && (
          <div className="user-profile-banner">
            <img src={user.banner_url} alt="Banner" />
          </div>
        )}

        <div className="user-profile-header">
          {user.avatar_url && (
            <img
              src={user.avatar_url}
              alt={user.display_name}
              className="user-profile-avatar"
            />
          )}

          <div className="user-profile-info">
            <h1>{user.display_name || user.username}</h1>
            <p className="user-profile-username">@{user.username}</p>
            {user.email && <p className="user-profile-email">{user.email}</p>}
          </div>
        </div>

        {user.bio && (
          <div className="user-profile-bio">
            <p>{user.bio}</p>
          </div>
        )}

        <div className="user-profile-meta">
          <div className="user-profile-stat">
            <span className="stat-label">Member Since</span>
            <span className="stat-value">{createdDate}</span>
          </div>

          {(user.roles?.length ?? 0) > 0 && (
            <div className="user-profile-stat">
              <span className="stat-label">Roles</span>
              <div className="stat-badges">
                {user.roles?.map((role) => (
                  <span key={role} className="badge badge-role">
                    {role}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(user.permissions?.length ?? 0) > 0 && (
            <div className="user-profile-stat">
              <span className="stat-label">Permissions</span>
              <div className="stat-badges">
                {user.permissions?.slice(0, 5).map((perm) => (
                  <span key={perm} className="badge badge-permission">
                    {perm}
                  </span>
                ))}
                {(user.permissions?.length ?? 0) > 5 && (
                  <span className="badge badge-more">
                    +{(user.permissions?.length ?? 0) - 5}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
