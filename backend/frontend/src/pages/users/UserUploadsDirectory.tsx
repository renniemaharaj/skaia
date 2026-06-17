import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { DirectoryLayout } from "../../components/page/layout/templates/DirectoryLayout";
import { FolderUp } from "lucide-react";
import UserUploads from "./UserUploads";
import { apiRequest } from "../../utils/api";
import UserAvatar from "../../components/user/UserAvatar";
import UserProfileOverlay from "../../components/user/UserProfileOverlay";

export default function UserUploadsDirectory() {
  const { userId } = useParams();
  const [user, setUser] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  useEffect(() => {
    if (!userId) return;
    apiRequest(`/users/${userId}`)
      .then((data: any) => {
        if (data) {
          setUser(data);
        }
      })
      .catch(() => {
        // failed to fetch profile, keep fallback
      });
  }, [userId]);

  const displayName = user?.display_name || user?.username || "User";

  const uploadsContent = (
    <UserUploads
      userId={userId}
      displayName={displayName}
      hideHeader={true}
      externalViewMode={viewMode}
      externalSearch={search}
    />
  );

  return (
    <DirectoryLayout
      title={
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {user ? (
            <UserProfileOverlay userId={user.id} fallbackName={displayName} fallbackAvatar={user.avatar_url}>
              <Link to={`/users/${user.id}`} style={{ display: "flex", alignItems: "center", gap: "12px", color: "inherit", textDecoration: "none" }}>
                <UserAvatar
                  src={user.avatar_url}
                  alt={displayName}
                  size={32}
                  initials={displayName[0]?.toUpperCase()}
                />
                <span>{displayName}'s Uploads</span>
              </Link>
            </UserProfileOverlay>
          ) : (
            <>
              <FolderUp size={32} />
              <span>{displayName}'s Uploads</span>
            </>
          )}
        </div>
      }
      subtitle={`Browse and download public uploads from ${displayName}.`}
      searchPlaceholder="Search uploads..."
      searchValue={search}
      onSearchChange={setSearch}
      viewMode={viewMode}
      onViewModeChange={(m) => setViewMode(m as "grid" | "list")}
      customListContent={uploadsContent}
      customGridContent={uploadsContent}
      items={user ? [1] : []} // Dummy items array so emptyState isn't triggered erroneously if we handle empty inside UserUploads
      renderGridCard={() => null}
    />
  );
}
