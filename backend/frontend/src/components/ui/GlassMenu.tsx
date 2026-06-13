import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";
import "./GlassMenu.css";

export interface GlassMenuOption {
  title: string | React.ReactNode;
  icon?: React.ReactNode;
  info?: string | React.ReactNode;
  onClick?: () => void;
  subOptions?: GlassMenuOption[];
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
  const currentOptions =
    history.length > 0 ? history[history.length - 1] : options;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    // Use capture phase to handle clicks outside reliably before propagation
    document.addEventListener("mousedown", handleClickOutside, {
      capture: true,
    });
    return () => {
      document.removeEventListener("mousedown", handleClickOutside, {
        capture: true,
      });
    };
  }, [onClose]);

  // Adjust positioning to avoid edge clipping
  const estimatedHeight =
    currentOptions.length * 40 + 20 + (history.length > 0 ? 40 : 0);
  const estimatedWidth = 250;
  const safeY = Math.min(y, window.innerHeight - estimatedHeight);
  const safeX = Math.min(x, window.innerWidth - estimatedWidth);

  const style: React.CSSProperties = {
    top: `${safeY}px`,
    left: `${safeX}px`,
  };

  const goBack = (e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory((prev) => prev.slice(0, -1));
  };

  return createPortal(
    <div className="glass-menu-wrap" style={style} ref={menuRef}>
      {history.length > 0 && (
        <div
          className="glass-menu-op"
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
        </div>
      )}
      {currentOptions.map((opt, i) => (
        <div
          key={i}
          className="glass-menu-op"
          onClick={(e) => {
            e.stopPropagation();
            if (opt.subOptions && opt.subOptions.length > 0) {
              setHistory((prev) => [...prev, opt.subOptions!]);
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
        </div>
      ))}
    </div>,
    document.body,
  );
}
