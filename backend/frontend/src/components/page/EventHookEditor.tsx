import { ChevronDown, ChevronRight, Zap } from "lucide-react";
/**
 * EventHookEditor — collapsible panel for writing TypeScript event handlers
 * on a component. Each supported event gets a code textarea.
 */
import { useState } from "react";
import type { ComponentEvent, EventHook } from "./types";
import { COMPONENT_EVENTS } from "./types";
import "./EventHookEditor.css";

interface EventHookEditorProps {
  hooks: EventHook[];
  onChange: (hooks: EventHook[]) => void;
}

export function EventHookEditor({ hooks, onChange }: EventHookEditorProps) {
  const [expanded, setExpanded] = useState<Set<ComponentEvent>>(new Set());

  const hookMap = new Map<ComponentEvent, EventHook>(hooks.map(h => [h.event, h]));

  const toggle = (ev: ComponentEvent) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(ev)) next.delete(ev);
      else next.add(ev);
      return next;
    });
  };

  const updateCode = (ev: ComponentEvent, code: string) => {
    const existing = hooks.filter(h => h.event !== ev);
    if (code.trim()) {
      existing.push({ event: ev, code });
    }
    onChange(existing);
  };

  const activeCount = hooks.filter(h => h.code.trim()).length;

  return (
    <div className="ehe">
      <div className="ehe__header">
        <Zap size={14} />
        <span className="ehe__title">Event Hooks</span>
        {activeCount > 0 && <span className="ehe__badge">{activeCount}</span>}
      </div>
      <div className="ehe__list">
        {COMPONENT_EVENTS.map(ev => {
          const isOpen = expanded.has(ev);
          const hook = hookMap.get(ev);
          const hasCode = !!hook?.code.trim();
          return (
            <div key={ev} className={`ehe__event${hasCode ? " ehe__event--active" : ""}`}>
              <button type="button" className="ehe__event-toggle" onClick={() => toggle(ev)}>
                {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                <span className="ehe__event-name">{ev}</span>
                {hasCode && <span className="ehe__event-dot" />}
              </button>
              {isOpen && (
                <div className="ehe__editor">
                  <textarea
                    className="ehe__textarea"
                    rows={6}
                    placeholder={`// TypeScript handler for ${ev}\n// Available: row, bindings, event`}
                    value={hook?.code ?? ""}
                    onChange={e => updateCode(ev, e.target.value)}
                    spellCheck={false}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
