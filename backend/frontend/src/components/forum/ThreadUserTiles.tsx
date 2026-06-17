import { Eye, Heart, Loader2, Users } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../../utils/api";
import UserAvatar from "../user/UserAvatar";
import UserProfileOverlay from "../user/UserProfileOverlay";
import type { ProfileUser } from "../user/types";
import "./ThreadUserTiles.css";

interface UserTileProps {
  threadId: string;
  type: "likers" | "viewers" | "contributors";
}

const PAGE_SIZE = 20;

export const ThreadUserTiles: React.FC<UserTileProps> = ({ threadId, type }) => {
  const [users, setUsers] = useState<ProfileUser[]>([]);
  const [, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const observer = useRef<IntersectionObserver | null>(null);

  const fetchUsers = async (pageNum: number) => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const data = await apiRequest<ProfileUser[]>(
        `/forum/threads/${threadId}/${type}?limit=${PAGE_SIZE}&offset=${pageNum * PAGE_SIZE}`
      );

      const newUsers = data || [];
      if (pageNum === 0) {
        setUsers(newUsers);
      } else {
        setUsers(prev => [...prev, ...newUsers]);
      }

      if (newUsers.length < PAGE_SIZE) {
        setHasMore(false);
      }
    } catch (err) {
      console.error(`Failed to fetch thread ${type}`, err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setUsers([]);
    setPage(0);
    setHasMore(true);
    fetchUsers(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, type]);

  const lastUserRef = useCallback(
    (node: HTMLDivElement) => {
      if (loading) return;
      if (observer.current) observer.current.disconnect();
      observer.current = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && hasMore) {
          setPage(prev => {
            const next = prev + 1;
            fetchUsers(next);
            return next;
          });
        }
      });
      if (node) observer.current.observe(node);
    },
    [loading, hasMore]
  );

  if (users.length === 0 && !loading) {
    return null; // Don't show the tile if empty
  }

  const title = type === "likers" ? "Liked by" : type === "viewers" ? "Viewed by" : "Contributors";
  const Icon = type === "likers" ? Heart : type === "viewers" ? Eye : Users;

  return (
    <div className="card thread-user-tile">
      <div className="tut-header">
        <Icon size={16} />
        <h3>{title}</h3>
      </div>
      <div className="tut-content">
        {users.map((user, idx) => {
          const isLast = idx === users.length - 1;
          return (
            <div
              key={`${user.id}-${idx}`}
              ref={isLast ? lastUserRef : null}
              className="tut-user-icon"
            >
              <UserProfileOverlay
                userId={user.id}
                fallbackName={user.display_name || user.username}
                fallbackAvatar={user.avatar_url}
              >
                <UserAvatar
                  src={user.avatar_url}
                  alt={user.display_name || user.username}
                  size={32}
                  initials={(user.display_name || user.username || "?")[0]?.toUpperCase()}
                />
              </UserProfileOverlay>
            </div>
          );
        })}
        {loading && (
          <div className="tut-loading">
            <Loader2 className="animate-spin" size={24} />
          </div>
        )}
      </div>
    </div>
  );
};
