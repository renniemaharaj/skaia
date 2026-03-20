import React from "react";
import { UserCog2Icon } from "lucide-react";
import "./UserAvatar.css";

interface UserAvatarProps {
  src?: string | null;
  alt?: string;
  size?: number;
  className?: string;
  initials?: string;
}

const UserAvatar: React.FC<UserAvatarProps> = ({
  src,
  alt = "User avatar",
  size = 40,
  className = "",
  initials,
}) => {
  const sharedClasses = `user-avatar ${className}`.trim();
  const style: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    fontSize: `${Math.max(12, Math.floor(size / 2.3))}px`,
  };

  if (src) {
    return <img src={src} alt={alt} className={sharedClasses} style={style} />;
  }

  if (initials) {
    return (
      <span
        className={`${sharedClasses} user-avatar-placeholder`}
        style={style}
      >
        {initials}
      </span>
    );
  }

  return (
    <span className={`${sharedClasses} user-avatar-placeholder`} style={style}>
      <UserCog2Icon size={Math.max(14, Math.floor(size * 0.5))} />
    </span>
  );
};

export default UserAvatar;
