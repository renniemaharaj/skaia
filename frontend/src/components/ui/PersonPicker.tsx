import { useAtomValue } from "jotai";
import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type User, currentUserAtom } from "../../atoms/auth";
import { apiRequest } from "../../utils/api";
import UserAvatar from "../user/UserAvatar";
import UserProfileOverlay from "../user/UserProfileOverlay";
import { GlassMenu, type GlassMenuOption } from "./GlassMenu";
import SearchField from "./SearchField";
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
  /** How search results are presented. Defaults to the inline list. */
  resultsVariant?: "inline" | "glass-menu";
  /** Clear the search field after selecting a user. */
  clearQueryOnSelect?: boolean;
}

const PAGE_SIZE = 50;
const DEFAULT_EXCLUDE_IDS: (number | string)[] = [];

export default function PersonPicker({
  onSelect,
  placeholder = "Search users…",
  excludeIds = DEFAULT_EXCLUDE_IDS,
  excludeSelf = true,
  className = "",
  autoFocus = true,
  onClose,
  resultsVariant = "inline",
  clearQueryOnSelect = false,
}: PersonPickerProps) {
  const currentUser = useAtomValue(currentUserAtom);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeFocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const useGlassMenu = resultsVariant === "glass-menu";
  const trimmedQuery = query.trim();
  const shouldShowGlassMenu = useGlassMenu && isFocused && trimmedQuery.length > 0;

  const excludeSet = useMemo(
    () =>
      new Set([
        ...excludeIds.map(String),
        ...(excludeSelf && currentUser ? [String(currentUser.id)] : []),
      ]),
    [excludeIds, excludeSelf, currentUser]
  );

  const updateMenuPosition = useCallback(() => {
    const rect = pickerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPosition({
      x: rect.left,
      y: rect.bottom + 6,
    });
  }, []);

  // Debounced search
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (useGlassMenu && trimmedQuery.length === 0) {
      setLoading(false);
      setResults([]);
      setOffset(0);
      setHasMore(false);
      return;
    }
    setLoading(true);
    setOffset(0);
    setHasMore(true);
    timerRef.current = setTimeout(async () => {
      try {
        const q = trimmedQuery;
        const url = q
          ? `/users/search?q=${encodeURIComponent(q)}&limit=${PAGE_SIZE}&offset=0`
          : `/users/search?limit=${PAGE_SIZE}&offset=0`;
        const users = await apiRequest<User[]>(url);
        const filtered = (users ?? []).filter(u => !excludeSet.has(String(u.id)));
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
  }, [useGlassMenu, trimmedQuery, excludeSet]);

  useEffect(() => {
    if (!shouldShowGlassMenu) return;
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [shouldShowGlassMenu, updateMenuPosition]);

  useEffect(() => {
    return () => {
      if (closeFocusTimerRef.current) clearTimeout(closeFocusTimerRef.current);
    };
  }, []);

  // Load more (infinite scroll)
  const loadMore = useCallback(async () => {
    if (useGlassMenu || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const q = trimmedQuery;
      const url = q
        ? `/users/search?q=${encodeURIComponent(q)}&limit=${PAGE_SIZE}&offset=${offset}`
        : `/users/search?limit=${PAGE_SIZE}&offset=${offset}`;
      const users = await apiRequest<User[]>(url);
      const filtered = (users ?? []).filter(u => !excludeSet.has(String(u.id)));
      setResults(prev => {
        const ids = new Set(prev.map(u => u.id));
        return [...prev, ...filtered.filter(u => !ids.has(u.id))];
      });
      setOffset(prev => prev + PAGE_SIZE);
      setHasMore((users ?? []).length >= PAGE_SIZE);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }, [offset, hasMore, loadingMore, trimmedQuery, excludeSet, useGlassMenu]);

  const handleScroll = useCallback(() => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    if (scrollHeight - scrollTop - clientHeight < 100) {
      loadMore();
    }
  }, [loadMore]);

  const handleSelect = useCallback(
    (user: User) => {
      onSelect(user);
      if (!clearQueryOnSelect) return;
      setQuery("");
      setResults([]);
      setOffset(0);
      setHasMore(false);
    },
    [clearQueryOnSelect, onSelect]
  );

  const glassMenuOptions = useMemo<GlassMenuOption[]>(() => {
    if (loading) {
      return [{ title: "Searching...", disabled: true }];
    }
    if (results.length === 0) {
      return [{ title: "No users found.", disabled: true }];
    }
    return results.map(user => ({
      key: user.id,
      title: user.display_name || user.username,
      info: `@${user.username}`,
      icon: (
        <UserAvatar
          src={user.avatar_url || undefined}
          alt={user.display_name || user.username}
          size={20}
          initials={(user.display_name || user.username)?.[0]?.toUpperCase()}
        />
      ),
      onClick: () => handleSelect(user),
    }));
  }, [loading, results, handleSelect]);

  return (
    <div
      className={`person-picker ${useGlassMenu ? "person-picker--glass-menu" : ""} ${className}`}
      ref={pickerRef}
    >
      <SearchField
        className="person-picker__input-wrap"
        inputClassName="person-picker__input"
        iconClassName="person-picker__icon"
        iconSize={14}
        placeholder={placeholder}
        value={query}
        autoFocus={autoFocus}
        onChange={setQuery}
        onKeyDown={e => {
          if (e.key === "Escape") {
            if (shouldShowGlassMenu) setIsFocused(false);
            if (onClose) onClose();
          }
        }}
        onFocus={() => {
          if (closeFocusTimerRef.current) {
            clearTimeout(closeFocusTimerRef.current);
            closeFocusTimerRef.current = null;
          }
          setIsFocused(true);
          updateMenuPosition();
        }}
        onBlur={() => {
          closeFocusTimerRef.current = setTimeout(() => {
            setIsFocused(false);
          }, 150);
        }}
      >
        {onClose && (
          <button type="button" className="person-picker__close" onClick={onClose} title="Close">
            <X size={14} />
          </button>
        )}
      </SearchField>
      {useGlassMenu ? (
        shouldShowGlassMenu && (
          <GlassMenu
            x={menuPosition.x}
            y={menuPosition.y}
            options={glassMenuOptions}
            onClose={() => setIsFocused(false)}
          />
        )
      ) : (
        <div className="person-picker__results" ref={listRef} onScroll={handleScroll}>
          {loading && <p className="person-picker__status">Searching…</p>}
          {!loading && results.length === 0 && (
            <p className="person-picker__status">No users found.</p>
          )}
          {results.map(user => (
            <button
              type="button"
              key={user.id}
              className="person-picker__row"
              onClick={() => handleSelect(user)}
            >
              <span className="person-picker__avatar">
                <UserProfileOverlay
                  userId={user.id}
                  fallbackName={user.display_name || user.username}
                  fallbackAvatar={user.avatar_url || undefined}
                  disableClick={true}
                >
                  <UserAvatar
                    src={user.avatar_url || undefined}
                    alt={user.display_name || user.username}
                    size={32}
                    initials={(user.display_name || user.username)?.[0]?.toUpperCase()}
                  />
                </UserProfileOverlay>
              </span>
              <span className="person-picker__info">
                <span className="person-picker__name">{user.display_name || user.username}</span>
                <span className="person-picker__username">@{user.username}</span>
              </span>
            </button>
          ))}
          {loadingMore && <p className="person-picker__status">Loading more…</p>}
        </div>
      )}
    </div>
  );
}
