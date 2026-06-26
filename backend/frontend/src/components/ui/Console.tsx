import { Activity, Plus, Settings, Terminal, X } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import "./Console.css";

export interface ConsoleLine {
  id?: string | number;
  text: string;
  prefix?: string;
  level?: string;
}

interface ConsoleProps {
  lines: ConsoleLine[];
  onCommand?: (command: string) => void;
  isBusy?: boolean;
  readOnly?: boolean;
  title?: React.ReactNode;
  headerExtra?: React.ReactNode;
  defaultOpen?: boolean;
  collapsible?: boolean;
  isOpen?: boolean;
  onToggle?: (isOpen: boolean) => void;
  availableStreams?: string[];
  subscribedStreams?: string[];
  onSubscribeStream?: (stream: string) => void;
  onUnsubscribeStream?: (stream: string) => void;
  logCap?: number;
  onLogCapChange?: (cap: number) => void;
}

export function Console({
  lines,
  onCommand,
  isBusy = false,
  readOnly = false,
  title = "Terminal",
  headerExtra,
  defaultOpen = true,
  collapsible = true,
  isOpen,
  onToggle,
  availableStreams = [],
  subscribedStreams = [],
  onSubscribeStream,
  onUnsubscribeStream,
  logCap = 500,
  onLogCapChange,
}: ConsoleProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(defaultOpen);
  const isOpenState = isOpen !== undefined ? isOpen : internalIsOpen;

  const [input, setInput] = useState("");
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  const handleScroll = () => {
    if (!outputRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = outputRef.current;
    wasAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 20;
  };

  useEffect(() => {
    if (wasAtBottomRef.current && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines, isOpenState]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isBusy || readOnly) return;
    if (onCommand) {
      onCommand(input.trim());
    }
    setInput("");
  };

  const handleToggle = () => {
    if (!collapsible) return;
    const newState = !isOpenState;
    setInternalIsOpen(newState);
    if (onToggle) onToggle(newState);
  };

  return (
    <div className="shared-console">
      <div
        className="shared-console-header"
        onClick={handleToggle}
        style={{ flexWrap: "wrap", gap: "12px" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Terminal size={18} style={{ color: "var(--accent-color)" }} />
          <div
            style={{ margin: 0, fontSize: "14px", color: "var(--text-primary)", fontWeight: 600 }}
          >
            {title}
          </div>
        </div>
        {headerExtra && (
          <div
            style={{ marginLeft: "auto", display: "flex", alignItems: "center", flexWrap: "wrap" }}
          >
            {headerExtra}
          </div>
        )}
      </div>

      {isOpenState && (
        <div className="shared-console-body">
          <div className="shared-console-toolbar">
            {/* Active Badges */}
            {subscribedStreams.length === 0 && availableStreams.length > 0 ? (
              <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                Select streams
              </span>
            ) : (
              subscribedStreams.map(stream => (
                <span key={stream} className="shared-console-badge">
                  {stream}
                  {onUnsubscribeStream && (
                    <X
                      size={12}
                      style={{ cursor: "pointer" }}
                      onClick={() => onUnsubscribeStream(stream)}
                    />
                  )}
                </span>
              ))
            )}

            <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
              {/* Settings Dropdown for Log Cap */}
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  className="action-btn"
                  style={{ padding: "2px 8px", height: "auto", fontSize: "0.8rem" }}
                  onClick={() => {
                    setIsSettingsOpen(!isSettingsOpen);
                    setIsPickerOpen(false);
                  }}
                >
                  <Settings size={14} style={{ marginRight: "4px" }} /> Settings
                </button>
                {isSettingsOpen && (
                  <div
                    className="glass-menu-wrap"
                    style={{ top: "100%", right: 0, marginTop: "4px", minWidth: "150px" }}
                  >
                    <div
                      style={{
                        padding: "8px 12px",
                        color: "var(--text-secondary)",
                        fontSize: "0.8rem",
                        borderBottom: "1px solid var(--border-color)",
                      }}
                    >
                      Max Log Lines
                    </div>
                    {[100, 500, 1000, 5000].map(cap => (
                      <button
                        key={cap}
                        type="button"
                        className="glass-menu-op"
                        style={{
                          background: logCap === cap ? "var(--bg-tertiary)" : "transparent",
                        }}
                        onClick={() => {
                          if (onLogCapChange) onLogCapChange(cap);
                          setIsSettingsOpen(false);
                        }}
                      >
                        <span
                          className="glass-menu-title"
                          style={{ margin: 0, fontWeight: logCap === cap ? 600 : 400 }}
                        >
                          {cap} lines
                        </span>
                        {logCap === cap && (
                          <div
                            style={{
                              width: "6px",
                              height: "6px",
                              borderRadius: "50%",
                              background: "var(--accent-color)",
                            }}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Stream Picker Dropdown */}
              {availableStreams.length > 0 && (
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    className="action-btn"
                    style={{ padding: "2px 8px", height: "auto", fontSize: "0.8rem" }}
                    onClick={() => {
                      setIsPickerOpen(!isPickerOpen);
                      setIsSettingsOpen(false);
                    }}
                  >
                    <Plus size={14} style={{ marginRight: "4px" }} /> Add Stream
                  </button>
                  {isPickerOpen && (
                    <div
                      className="glass-menu-wrap"
                      style={{ top: "100%", right: 0, marginTop: "4px", minWidth: "150px" }}
                    >
                      {availableStreams.map(stream => {
                        const isSubbed = subscribedStreams.includes(stream);
                        return (
                          <button
                            key={stream}
                            type="button"
                            className="glass-menu-op"
                            style={{ background: isSubbed ? "var(--bg-tertiary)" : "transparent" }}
                            onClick={() => {
                              if (isSubbed && onUnsubscribeStream) onUnsubscribeStream(stream);
                              if (!isSubbed && onSubscribeStream) onSubscribeStream(stream);
                            }}
                          >
                            <span
                              className="glass-menu-title"
                              style={{ margin: 0, fontWeight: isSubbed ? 600 : 400 }}
                            >
                              {stream}
                            </span>
                            {isSubbed && (
                              <div
                                style={{
                                  width: "6px",
                                  height: "6px",
                                  borderRadius: "50%",
                                  background: "var(--accent-color)",
                                }}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div
            ref={outputRef}
            onScroll={handleScroll}
            className="shared-console-output invisiblescroll"
          >
            {lines.length === 0 && (
              <div className="conp" style={{ color: "var(--text-muted)" }}>
                Ready...
              </div>
            )}
            {lines.map((line, i) => {
              let colorClass = "";
              const combinedText = `${line.prefix || ""} ${line.text}`;
              const level = line.level?.toLowerCase();
              if (level === "error" || level === "fatal" || level === "panic")
                colorClass = "log-error";
              else if (level === "warning" || level === "warn") colorClass = "log-warn";
              else if (level === "success") colorClass = "log-success";
              else if (level === "info" || level === "print") colorClass = "log-info";
              else if (/\[(ERROR|FATAL|PANIC)\]|\b(ERROR|FATAL|PANIC)\b/.test(combinedText))
                colorClass = "log-error";
              else if (/\[(WARN|WARNING)\]|\b(WARN|WARNING)\b/.test(combinedText))
                colorClass = "log-warn";
              else if (/\[SUCCESS\]|\bSUCCESS\b/.test(combinedText)) colorClass = "log-success";
              else if (/\[INFO\]|\bINFO\b/.test(combinedText)) colorClass = "log-info";

              return (
                <div key={line.id || i} className="conp">
                  {line.prefix && (
                    <span style={{ color: "var(--accent-color)", marginRight: "6px" }}>
                      {line.prefix} &gt;&gt;
                    </span>
                  )}
                  <span className={`conp-text ${colorClass}`}>{line.text}</span>
                </div>
              );
            })}
          </div>

          {!readOnly && (
            <form onSubmit={handleSubmit} className="shared-console-input-area">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Type a command..."
                className="form-input form-input--sm shared-console-input"
                disabled={isBusy}
              />
              <button
                type="submit"
                className="action-btn"
                disabled={isBusy || !input.trim()}
                title="Execute"
              >
                <Activity size={14} />
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
