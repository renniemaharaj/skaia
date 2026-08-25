import { useAtomValue } from "jotai";
import {
  Activity,
  AppWindow,
  CalendarDays,
  Bell,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  FileText,
  Gift,
  Globe2,
  Home,
  Images,
  Link2,
  Lightbulb,
  LayoutGrid,
  Moon,
  Search,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  Trophy,
  Sun,
  Users,
  Volume,
  Volume1,
  Volume2,
  VolumeX,
  Wrench,
} from "lucide-react";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { drawerToolGroupAtom } from "../../../atoms/drawerTools";
import { unreadNotifCountAtom } from "../../../atoms/notifications";
import {
  getSoundVolume,
  isSoundEnabled,
  setSoundEnabled,
  setSoundVolume,
} from "../../../utils/sound";
import InboxMail from "../../inbox/InboxMail";
import Select from "../../input/Select";
import NotificationBell from "../../notifications/NotificationBell";
import type { Branding } from "../types";

export interface DrawerNavigationItem {
  to: string;
  label: string;
  icon: string;
}

interface DrawerProps {
  navigationItems: DrawerNavigationItem[];
  cartCount: number;
  isDarkMode: boolean;
  layoutMode: "application" | "web";
  isAuthenticated: boolean;
  user: { id: string } | null;
  storeEnabled: boolean;
  inboxEnabled: boolean;
  canCustomize: boolean;
  branding: Branding | null;
  onSetTheme: () => void;
  onToggleLayoutMode: () => void;
  onNavigate: (path: string) => void;
  onSaveBranding: (updates: Partial<Branding>) => Promise<void>;
}

interface DrawerAppOption {
  id: string;
  label: string;
}

type DrawerView = "root" | "customize" | "sound" | "alerts" | "context-tools";

const navigationAppId = (item: DrawerNavigationItem) => `workspace:${item.to}`;

export function Drawer({
  navigationItems,
  cartCount,
  isDarkMode,
  layoutMode,
  isAuthenticated,
  user,
  storeEnabled,
  inboxEnabled,
  canCustomize,
  branding,
  onSetTheme,
  onToggleLayoutMode,
  onNavigate,
  onSaveBranding,
}: DrawerProps) {
  const drawerLocation = useLocation();
  const unreadNotifications = useAtomValue(unreadNotifCountAtom);
  const contextTools = useAtomValue(drawerToolGroupAtom);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [view, setView] = useState<DrawerView>("root");
  const [query, setQuery] = useState("");
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const keyboardIndex = useRef(-1);
  const animation = branding?.drawer_animation ?? "scale";
  const tileSize = branding?.drawer_icon_size ?? 40;
  const columns = branding?.drawer_columns ?? 5;
  const showLabels = branding?.drawer_show_labels ?? true;
  const hiddenApps = new Set(branding?.drawer_hidden_apps ?? []);

  const availableTools: DrawerAppOption[] = [
    { id: "theme", label: isDarkMode ? "Light" : "Dark" },
    {
      id: "layout",
      label: layoutMode === "application" ? "Web mode" : "App mode",
    },
    ...(storeEnabled ? [{ id: "cart", label: "Cart" }] : []),
    { id: "sound", label: "Sound" },
    ...(isAuthenticated ? [{ id: "alerts", label: "Alerts" }] : []),
    ...(isAuthenticated && inboxEnabled ? [{ id: "messages", label: "Messages" }] : []),
    ...(isAuthenticated && user ? [{ id: "settings", label: "Settings" }] : []),
    ...(contextTools ? [{ id: "context-tools", label: contextTools.label }] : []),
  ];
  const allApps: DrawerAppOption[] = [
    ...navigationItems.map(item => ({
      id: navigationAppId(item),
      label: item.label,
    })),
    ...availableTools,
  ];
  const filteredNavigationItems = navigationItems.filter(
    item =>
      !hiddenApps.has(navigationAppId(item)) &&
      item.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  );
  const drawerStyle = {
    "--drawer-columns": columns,
    "--drawer-icon-size": `${tileSize}px`,
  } as CSSProperties;

  const cancelClose = () => window.clearTimeout(closeTimer.current);
  const focusApp = (direction: "next" | "previous" | "vertical-forward" | "vertical-back") => {
    window.requestAnimationFrame(() => {
      const workspaceItems = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          ".drawer-workspaces .utility-launcher__item"
        ) ?? []
      );
      const toolItems = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          ".drawer-tools .utility-launcher__item, .drawer-tools .utility-launcher__embedded > a"
        ) ?? []
      );
      const items = [...workspaceItems, ...toolItems];
      if (items.length === 0) return;
      const activeElement = document.activeElement as HTMLElement;
      const activeIndex = items.indexOf(activeElement);
      const workspaceIndex = workspaceItems.indexOf(activeElement);
      const toolIndex = toolItems.indexOf(activeElement);

      if (direction === "vertical-forward" || direction === "vertical-back") {
        let target: HTMLElement | undefined;
        if (workspaceIndex >= 0 && toolItems.length > 0) {
          target = toolItems[workspaceIndex % toolItems.length];
        } else if (toolIndex >= 0 && workspaceItems.length > 0) {
          target = workspaceItems[toolIndex % workspaceItems.length];
        } else if (direction === "vertical-forward") {
          target = toolItems[0] ?? workspaceItems[0];
        } else {
          target = workspaceItems.at(-1) ?? toolItems.at(-1);
        }
        if (!target) return;
        keyboardIndex.current = items.indexOf(target);
        target.focus();
        return;
      }

      const delta = direction === "next" ? 1 : -1;
      const currentIndex = activeIndex >= 0 ? activeIndex : keyboardIndex.current;
      const nextIndex =
        currentIndex < 0
          ? delta > 0
            ? 0
            : items.length - 1
          : (currentIndex + delta + items.length) % items.length;
      keyboardIndex.current = nextIndex;
      items[nextIndex].focus();
    });
  };
  const scheduleClose = () => {
    if (pinned) return;
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 180);
  };

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(event.target as Node)) {
        setOpen(false);
        setPinned(false);
        setView("root");
        keyboardIndex.current = -1;
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const arrowDelta =
        event.key === "ArrowRight" || event.key === "ArrowDown"
          ? 1
          : event.key === "ArrowLeft" || event.key === "ArrowUp"
            ? -1
            : 0;
      const arrowDirection =
        event.key === "ArrowRight"
          ? "next"
          : event.key === "ArrowLeft"
            ? "previous"
            : event.key === "ArrowDown"
              ? "vertical-forward"
              : event.key === "ArrowUp"
                ? "vertical-back"
                : null;
      if (event.altKey && arrowDelta !== 0) {
        event.preventDefault();
        setOpen(true);
        setPinned(true);
        setView("root");
        setQuery("");
        if (arrowDirection) focusApp(arrowDirection);
        return;
      }
      const target = event.target as HTMLElement | null;
      const isTextControl = target?.matches("input, textarea, select, [contenteditable='true']");
      if (open && view === "root" && arrowDelta !== 0 && !isTextControl) {
        event.preventDefault();
        if (arrowDirection) focusApp(arrowDirection);
        return;
      }
      if (event.key === "Escape") {
        if (view !== "root") {
          setView("root");
        } else {
          setOpen(false);
          setPinned(false);
          keyboardIndex.current = -1;
        }
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelClose();
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, view]);

  const closeAfterAction = () => {
    setOpen(false);
    setPinned(false);
    setView("root");
    keyboardIndex.current = -1;
  };

  const setAppVisible = (id: string, visible: boolean) => {
    const next = new Set(branding?.drawer_hidden_apps ?? []);
    if (visible) next.delete(id);
    else next.add(id);
    void onSaveBranding({ drawer_hidden_apps: [...next] });
  };

  const label = (text: string) =>
    showLabels ? <span className="drawer-app-label">{text}</span> : null;

  return (
    <div
      className={`utility-launcher${open ? " utility-launcher--open" : ""}`}
      data-animation={animation}
      data-labels={showLabels ? "shown" : "hidden"}
      style={drawerStyle}
      ref={drawerRef}
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
      onFocusCapture={() => setOpen(true)}
    >
      <button
        className="utility-launcher__trigger"
        type="button"
        title="Open drawer"
        aria-label="Open drawer"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-keyshortcuts="Alt+ArrowRight Alt+ArrowLeft Alt+ArrowDown Alt+ArrowUp"
        onClick={() => {
          if (pinned) {
            setPinned(false);
            setOpen(false);
            setView("root");
            keyboardIndex.current = -1;
          } else {
            setPinned(true);
            setOpen(true);
          }
        }}
      >
        <LayoutGrid size={19} />
        <span className="utility-launcher__trigger-label">Sites</span>
        <ChevronDown className="utility-launcher__trigger-chevron" size={15} />
        {cartCount > 0 && <span className="utility-launcher__indicator" />}
      </button>

      <div
        className="utility-launcher__panel"
        role="dialog"
        aria-label="App drawer"
        aria-hidden={!open}
      >
        {view !== "root" && (
          <div className="drawer-detail-header">
            <button type="button" onClick={() => setView("root")} aria-label="Back to drawer">
              <ChevronLeft size={18} />
            </button>
            <span>
              {view === "customize"
                ? "Customize drawer"
                : view === "sound"
                  ? "Sound"
                  : view === "context-tools"
                    ? contextTools?.label
                    : "Alerts"}
            </span>
          </div>
        )}
        {view === "root" && (
          <div className="drawer-search-row">
            <label className="drawer-search">
              <Search size={15} />
              <input
                type="search"
                value={query}
                placeholder="Search features"
                aria-label="Search drawer"
                onChange={event => setQuery(event.target.value)}
              />
            </label>
            {canCustomize && (
              <button
                className="drawer-customize-trigger"
                type="button"
                title="Customize drawer"
                aria-label="Customize drawer"
                aria-haspopup="true"
                onClick={() => {
                  setPinned(true);
                  setView("customize");
                }}
              >
                <SlidersHorizontal size={16} />
              </button>
            )}
          </div>
        )}
        {view === "customize" && (
          <div className="drawer-customizer">
            <div className="drawer-customizer__fields">
              <Select
                label="Animation"
                size="sm"
                block
                value={animation}
                options={[
                  { value: "scale", label: "Scale" },
                  { value: "slide", label: "Slide" },
                  { value: "fade", label: "Fade" },
                ]}
                onChange={event =>
                  onSaveBranding({
                    drawer_animation: event.target.value as Branding["drawer_animation"],
                  })
                }
              />
              <Select
                label="Tile size"
                size="sm"
                block
                value={String(tileSize)}
                options={[
                  { value: "32", label: "Compact" },
                  { value: "40", label: "Comfortable" },
                  { value: "48", label: "Large" },
                ]}
                onChange={event =>
                  onSaveBranding({
                    drawer_icon_size: Number(event.target.value) as Branding["drawer_icon_size"],
                  })
                }
              />
              <Select
                label="Grid"
                size="sm"
                block
                value={String(columns)}
                options={[
                  { value: "3", label: "3 columns" },
                  { value: "4", label: "4 columns" },
                  { value: "5", label: "5 columns" },
                ]}
                onChange={event =>
                  onSaveBranding({
                    drawer_columns: Number(event.target.value) as Branding["drawer_columns"],
                  })
                }
              />
              <Select
                label="Labels"
                size="sm"
                block
                value={showLabels ? "show" : "hide"}
                options={[
                  { value: "show", label: "Show labels" },
                  { value: "hide", label: "Hide labels" },
                ]}
                onChange={event =>
                  onSaveBranding({
                    drawer_show_labels: event.target.value === "show",
                  })
                }
              />
            </div>
            <fieldset className="drawer-visibility">
              <legend>Visible apps</legend>
              <div>
                {allApps.map(app => (
                  <label key={app.id}>
                    <input
                      type="checkbox"
                      checked={!hiddenApps.has(app.id)}
                      onChange={event => setAppVisible(app.id, event.target.checked)}
                    />
                    <span>{app.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        )}
        {view === "sound" && <SoundPanel />}
        {view === "alerts" && <NotificationBell embedded />}
        {view === "context-tools" && contextTools && (
          <div className="drawer-context-tools">
            {contextTools.selects?.map(control => (
              <Select
                key={control.id}
                label={control.label}
                block
                value={control.value}
                options={control.options}
                truncateSelectedTo={control.truncateSelectedTo}
                onChange={event => control.onChange(event.target.value)}
              />
            ))}
            <div className="drawer-context-tools__actions">
              {contextTools.actions.map(action => (
                <button
                  key={action.id}
                  type="button"
                  className={`drawer-context-tools__action drawer-context-tools__action--${action.tone ?? "default"}`}
                  disabled={action.disabled}
                  onClick={() => {
                    closeAfterAction();
                    action.onSelect();
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {view === "root" && filteredNavigationItems.length > 0 && (
          <>
            <div className="drawer-section-title">Workspaces</div>
            <div className="utility-launcher__grid drawer-workspaces">
              {filteredNavigationItems.map(item => (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-label={item.label}
                  title={item.label}
                  className={`utility-launcher__item${
                    drawerLocation.pathname === item.to ||
                    (item.to !== "/" && drawerLocation.pathname.startsWith(`${item.to}/`))
                      ? " active"
                      : ""
                  }`}
                  onClick={closeAfterAction}
                >
                  <span className="utility-launcher__icon drawer-workspace-icon">
                    <DrawerIcon name={item.icon} />
                  </span>
                  {label(item.label)}
                </Link>
              ))}
            </div>
          </>
        )}
        {view === "root" && !query && <div className="drawer-section-title">Tools</div>}
        {view === "root" && (
          <div
            className={`utility-launcher__grid drawer-tools${query ? " drawer-tools--hidden" : ""}`}
          >
            {!hiddenApps.has("theme") && (
              <button
                className="utility-launcher__item"
                type="button"
                title="Toggle dark mode"
                aria-label="Toggle dark mode"
                onClick={() => {
                  onSetTheme();
                  closeAfterAction();
                }}
              >
                <span className="utility-launcher__icon utility-launcher__icon--violet">
                  {isDarkMode ? <Sun /> : <Moon />}
                </span>
                {label(isDarkMode ? "Light" : "Dark")}
              </button>
            )}
            {!hiddenApps.has("layout") && (
              <button
                className="utility-launcher__item"
                type="button"
                title={
                  layoutMode === "application"
                    ? "Switch to Web Page Mode"
                    : "Switch to Application Mode"
                }
                aria-label={
                  layoutMode === "application" ? "Switch to web mode" : "Switch to app mode"
                }
                onClick={() => {
                  onToggleLayoutMode();
                  closeAfterAction();
                }}
              >
                <span className="utility-launcher__icon utility-launcher__icon--cyan">
                  {layoutMode === "application" ? <Globe2 /> : <AppWindow />}
                </span>
                {label(layoutMode === "application" ? "Web mode" : "App mode")}
              </button>
            )}
            {storeEnabled && !hiddenApps.has("cart") && (
              <button
                className="utility-launcher__item"
                type="button"
                title="Shopping Cart"
                aria-label="Shopping Cart"
                onClick={() => {
                  onNavigate("/cart");
                  closeAfterAction();
                }}
              >
                <span className="utility-launcher__icon utility-launcher__icon--amber">
                  <ShoppingCart />
                  {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
                </span>
                {label("Cart")}
              </button>
            )}
            {!hiddenApps.has("sound") && (
              <button
                className="utility-launcher__item"
                type="button"
                title="Sound controls"
                aria-label="Sound controls"
                onClick={() => {
                  setPinned(true);
                  setView("sound");
                }}
              >
                <span className="utility-launcher__icon utility-launcher__icon--rose">
                  <Volume2 />
                </span>
                {label("Sound")}
              </button>
            )}
            {isAuthenticated && !hiddenApps.has("alerts") && (
              <button
                className="utility-launcher__item"
                type="button"
                title="Alerts"
                aria-label={`Alerts${unreadNotifications > 0 ? `, ${unreadNotifications} unread` : ""}`}
                onClick={() => {
                  setPinned(true);
                  setView("alerts");
                }}
              >
                <span className="utility-launcher__icon drawer-alert-icon">
                  <Bell />
                  {unreadNotifications > 0 && (
                    <span className="notif-badge">
                      {unreadNotifications > 99 ? "99+" : unreadNotifications}
                    </span>
                  )}
                </span>
                {label("Alerts")}
              </button>
            )}
            {isAuthenticated && inboxEnabled && !hiddenApps.has("messages") && (
              <div className="utility-launcher__embedded" role="none" title="Messages">
                <InboxMail />
                {label("Messages")}
              </div>
            )}
            {isAuthenticated && user && !hiddenApps.has("settings") && (
              <Link
                to={`/form/user/${user.id}/profile`}
                className="utility-launcher__item"
                title="Settings"
                aria-label="Settings"
                onClick={closeAfterAction}
              >
                <span className="utility-launcher__icon utility-launcher__icon--slate">
                  <Settings />
                </span>
                {label("Settings")}
              </Link>
            )}
            {contextTools && !hiddenApps.has("context-tools") && (
              <button
                className="utility-launcher__item"
                type="button"
                title={contextTools.label}
                aria-label={contextTools.label}
                onClick={() => {
                  setPinned(true);
                  setView("context-tools");
                }}
              >
                <span className="utility-launcher__icon utility-launcher__icon--slate">
                  <Wrench />
                </span>
                {label(contextTools.label)}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DrawerIcon({ name }: { name: string }) {
  if (name === "home") return <Home />;
  if (name === "store") return <Store />;
  if (name === "forum" || name === "users") return <Users />;
  if (name === "docs" || name === "bible") return <BookOpen />;
  if (name === "pages") return <FileText />;
  if (name === "activity") return <Activity />;
  if (name === "community") return <Globe2 />;
  if (name === "rankings") return <Trophy />;
  if (name === "rewards") return <Gift />;
  if (name === "proposals") return <Lightbulb />;
  if (name === "showcases") return <Images />;
  if (name === "events") return <CalendarDays />;
  if (name === "identities") return <Link2 />;
  if (name === "status") return <Activity />;
  return <AppWindow />;
}

function SoundPanel() {
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());
  const [volume, setVolume] = useState(() => getSoundVolume());

  return (
    <div className="drawer-sound-panel">
      <div className="drawer-sound-panel__volume">
        <button
          type="button"
          className="drawer-sound-panel__mute"
          title={soundOn ? "Mute sounds" : "Unmute sounds"}
          aria-label={soundOn ? "Mute sounds" : "Unmute sounds"}
          onClick={() => {
            if (soundOn) {
              setSoundEnabled(false);
              setSoundOn(false);
            } else {
              const restored = volume > 0 ? volume : 0.7;
              setSoundVolume(restored);
              setVolume(restored);
              setSoundOn(true);
            }
          }}
        >
          {!soundOn || volume === 0 ? (
            <VolumeX />
          ) : volume < 0.33 ? (
            <Volume />
          ) : volume < 0.66 ? (
            <Volume1 />
          ) : (
            <Volume2 />
          )}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          aria-label="Sound volume"
          onChange={event => {
            const nextVolume = Number.parseFloat(event.target.value);
            setVolume(nextVolume);
            setSoundVolume(nextVolume);
            setSoundOn(nextVolume > 0);
          }}
        />
        <output>{Math.round(volume * 100)}%</output>
      </div>
    </div>
  );
}
