import { ChevronLeft } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./GlassMenu.css";

export interface GlassMenuOption {
  key?: React.Key;
  title: string | React.ReactNode;
  icon?: React.ReactNode;
  info?: string | React.ReactNode;
  onClick?: () => void;
  subOptions?: GlassMenuOption[];
  disabled?: boolean;
}

export interface GlassMenuProps {
  x: number;
  y: number;
  options: GlassMenuOption[];
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
}

const viewportPadding = 8;

export function GlassMenu({ x, y, options, onClose, anchorRef }: GlassMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<GlassMenuOption[][]>([]);
  const [position, setPosition] = useState({ x, y });
  const currentOptions = history.length > 0 ? history[history.length - 1] : options;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        !anchorRef?.current?.contains(target)
      ) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    // Use capture phase to handle clicks outside reliably before propagation
    document.addEventListener("mousedown", handleClickOutside, {
      capture: true,
    });
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, {
        capture: true,
      });
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [anchorRef, onClose]);

  // Adjust positioning to avoid edge clipping
  const estimatedHeight = currentOptions.length * 40 + 20 + (history.length > 0 ? 40 : 0);
  const estimatedWidth = 250;
  const renderedHeight = Math.min(estimatedHeight, window.innerHeight * 0.9);
  const initialY = Math.max(
    viewportPadding,
    Math.min(y, window.innerHeight - renderedHeight - viewportPadding)
  );
  const initialX = Math.max(
    viewportPadding,
    Math.min(x, window.innerWidth - estimatedWidth - viewportPadding)
  );

  const updatePosition = useCallback(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    const menuWidth = menu.offsetWidth || rect.width;
    const menuHeight = menu.offsetHeight || rect.height;
    const anchorRect = anchorRef?.current?.getBoundingClientRect();
    const preferredX = anchorRect ? anchorRect.right - menuWidth : x;
    const preferredY = anchorRect ? anchorRect.bottom + viewportPadding : y;
    const nextX = Math.max(
      viewportPadding,
      Math.min(preferredX, window.innerWidth - menuWidth - viewportPadding)
    );
    const nextY = Math.max(
      viewportPadding,
      Math.min(preferredY, window.innerHeight - menuHeight - viewportPadding)
    );
    setPosition(previous =>
      previous.x === nextX && previous.y === nextY ? previous : { x: nextX, y: nextY }
    );
  }, [anchorRef, x, y]);

  useLayoutEffect(() => {
    setPosition({ x: initialX, y: initialY });
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [initialX, initialY, updatePosition, currentOptions]);

  const style: React.CSSProperties = {
    top: `${position.y}px`,
    left: `${position.x}px`,
  };

  const goBack = (e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => prev.slice(0, -1));
  };

  const getOptionKey = (opt: GlassMenuOption) => {
    if (opt.key !== undefined) return opt.key;
    if (typeof opt.title === "string") return opt.title;
    if (typeof opt.info === "string") return opt.info;
    return "glass-menu-option";
  };

  return createPortal(
    <div className="glass-menu-wrap" style={style} ref={menuRef} role="menu">
      {history.length > 0 && (
        <button
          type="button"
          className="glass-menu-op"
          role="menuitem"
          onMouseDown={e => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={goBack}
          style={{
            borderBottom: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
            opacity: 0.8,
          }}
        >
          <span className="glass-menu-icon">
            <ChevronLeft size={16} />
          </span>
          <span className="glass-menu-title">Back</span>
        </button>
      )}
      {currentOptions.map(opt => (
        <button
          type="button"
          key={getOptionKey(opt)}
          className={`glass-menu-op${opt.disabled ? " glass-menu-op--disabled" : ""}`}
          disabled={opt.disabled}
          role="menuitem"
          aria-disabled={opt.disabled || undefined}
          onMouseDown={e => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={e => {
            e.stopPropagation();
            const subOptions = opt.subOptions;
            if (subOptions && subOptions.length > 0) {
              setHistory(prev => [...prev, subOptions]);
            } else if (opt.onClick) {
              opt.onClick();
              onClose();
            }
          }}
        >
          {opt.icon && (
            <span className="glass-menu-icon" style={{ marginRight: 8 }}>
              {opt.icon}
            </span>
          )}
          <span className="glass-menu-title">{opt.title}</span>
          {opt.info && <span className="glass-menu-info">{opt.info}</span>}
        </button>
      ))}
    </div>,
    document.body
  );
}
