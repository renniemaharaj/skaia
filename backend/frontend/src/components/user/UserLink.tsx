import React from "react";
import { Link } from "react-router-dom";
import "./UserLink.css";

interface UserLinkProps {
  userId: string;
  username?: string;
  displayName?: string;
  className?: string;
  variant?: "default" | "subtle";
}

/**
 * Reusable user link component for displaying and navigating to user profiles
 * Works across the entire site:
 * - Click to visit the user's profile at /users/{userId}
 * - Displays user's display_name if available, falls back to username
 */
const UserLink: React.FC<UserLinkProps> = ({
  userId,
  username = "Unknown User",
  displayName,
  className = "",
  variant = "default",
}) => {
  const displayText = displayName || username;

  return (
    <Link
      to={`/users/${userId}`}
      className={`user-link user-link--${variant} ${className}`}
      title={`View ${displayText}'s profile`}
    >
      {displayText}
    </Link>
  );
};

export default UserLink;
