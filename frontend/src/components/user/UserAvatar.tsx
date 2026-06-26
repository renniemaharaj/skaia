import { UserCog2Icon } from "lucide-react";
import type React from "react";
import { useState } from "react";
import "./UserAvatar.css";

interface UserAvatarProps {
  src?: string | null;
  alt?: string;
  size?: number;
  className?: string;
  initials?: string;
  style?: React.CSSProperties;
  onImageError?: React.ReactEventHandler<HTMLImageElement>;
}

const UserAvatar: React.FC<UserAvatarProps> = ({
  src,
  alt = "User avatar",
  size = 40,
  className = "",
  initials,
  style,
  onImageError,
}) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const sharedClasses = `user-avatar ${className}`.trim();
  const baseStyle: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    fontSize: `${Math.max(12, Math.floor(size / 2.3))}px`,
    flexShrink: 0,
    ...style,
  };

  if (src && failedSrc !== src) {
    return (
      <img
        src={src}
        alt={alt}
        className={sharedClasses}
        style={baseStyle}
        onError={event => {
          setFailedSrc(src);
          onImageError?.(event);
        }}
      />
    );
  }

  if (initials) {
    return (
      <span className={`${sharedClasses} user-avatar-placeholder`} style={baseStyle}>
        {initials}
      </span>
    );
  }

  return (
    <span className={`${sharedClasses} user-avatar-placeholder`} style={baseStyle}>
      <UserCog2Icon size={Math.max(14, Math.floor(size * 0.5))} />
    </span>
  );
};

export default UserAvatar;
