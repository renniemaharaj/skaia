import { useEffect, useRef, useState, useCallback } from "react";
import { useAtomValue } from "jotai";
import { Search, X } from "lucide-react";
import { currentUserAtom, type User } from "../../atoms/auth";
import { apiRequest } from "../../utils/api";
import UserAvatar from "../user/UserAvatar";
import "./PersonPicker.css";

interface PersonPickerProps {
  /** Called when a user is selected. */
  onSelect: (user: User) => void;
  /** Placeholder for the search input. */
  placeholder?: string;
  /** Users to exclude from results (e.g. already added editors). */
  excludeIds?: (number | string)[];
  /** Whether to exclude the current user from results. Defaults to true. */
  excludeSelf?: boolean;
  /** Optional className for the wrapper. */
  className?: string;
  /** Auto-focus on mount. */
  autoFocus?: boolean;
  /** Called when the picker is dismissed. */
  onClose?: () => void;
}

const PAGE_SIZE = 50;

export default function PersonPicker({
  onSelect,
  placeholder = "Search users…",
  excludeIds = [],
  excludeSelf = true,
  className = "",
  autoFocus = true,
  onClose,
}: PersonPickerProps) {
  const currentUser = useAtomValue(currentUserAtom);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const excludeSet = new Set([
    ...excludeIds.map(String),
    ...(excludeSelf && currentUser ? [String(currentUser.id)] : []),
  ]);

  // Debounced search
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setLoading(true);
    setOffset(0);
    setHasMore(true);
    timerRef.current = setTimeout(async () => {
      try {
        const q = query.trim();
        const url = q
          ? `/users/search?q=${encodeURIComponent(q)}&limit=${PAGE_SIZE}&offset=0`
          : `/users/search?limit=${PAGE_SIZE}&offset=0`;
        const users = await apiRequest<User[]>(url);
        const filtered = (users ?? []).filter(
          (u) => !excludeSet.has(String(u.id)),
        );
        setResults(filtered);
        setOffset(PAGE_SIZE);
        setHasMore((users ?? []).length >= PAGE_SIZE);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  // Load more (infinite scroll)
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const q = query.trim();
      const url = q
        ? `/users/search?q=${encodeURIComponent(q)}&limit=${PAGE_SIZE}&offset=${offset}`
        : `/users/search?limit=${PAGE_SIZE}&offset=${offset}`;
      const users = await apiRequest<User[]>(url);
      const filtered = (users ?? []).filter(
        (u) => !excludeSet.has(String(u.id)),
      );
      setResults((prev) => {
        const ids = new Set(prev.map((u) => u.id));
        return [...prev, ...filtered.filter((u) => !ids.has(u.id))];
      });
      setOffset((prev) => prev + PAGE_SIZE);
      setHasMore((users ?? []).length >= PAGE_SIZE);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }, [offset, hasMore, loadingMore, query]);

  const handleScroll = useCallback(() => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      loadMore();
    }
  }, [loadMore]);

  return (
    <div className={`person-picker ${className}`}>
      <div className="person-picker__input-wrap">
        <Search size={14} className="person-picker__icon" />
        <input
          className="person-picker__input"
          placeholder={placeholder}
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && onClose) onClose();
          }}
        />
        {onClose && (
          <button
            className="person-picker__close"
            onClick={onClose}
            title="Close"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div
        className="person-picker__results"
        ref={listRef}
        onScroll={handleScroll}
      >
        {loading && <p className="person-picker__status">Searching…</p>}
        {!loading && results.length === 0 && (
          <p className="person-picker__status">No users found.</p>
        )}
        {results.map((user) => (
          <button
            key={user.id}
            className="person-picker__row"
            onClick={() => onSelect(user)}
          >
            <span className="person-picker__avatar">
              <UserAvatar
                src={user.avatar_url || undefined}
                alt={user.display_name || user.username}
                size={18}
                initials={(user.display_name ||
                  user.username)?.[0]?.toUpperCase()}
              />
            </span>
            <span className="person-picker__info">
              <span className="person-picker__name">
                {user.display_name || user.username}
              </span>
              <span className="person-picker__username">@{user.username}</span>
            </span>
          </button>
        ))}
        {loadingMore && <p className="person-picker__status">Loading more…</p>}
      </div>
    </div>
  );
}
