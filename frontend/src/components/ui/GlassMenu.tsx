import { ChevronLeft } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
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
}

export function GlassMenu({ x, y, options, onClose }: GlassMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<GlassMenuOption[][]>([]);
  const currentOptions = history.length > 0 ? history[history.length - 1] : options;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
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
  }, [onClose]);

  // Adjust positioning to avoid edge clipping
  const estimatedHeight = currentOptions.length * 40 + 20 + (history.length > 0 ? 40 : 0);
  const estimatedWidth = 250;
  const safeY = Math.min(y, window.innerHeight - estimatedHeight);
  const safeX = Math.min(x, window.innerWidth - estimatedWidth);

  const style: React.CSSProperties = {
    top: `${safeY}px`,
    left: `${safeX}px`,
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
