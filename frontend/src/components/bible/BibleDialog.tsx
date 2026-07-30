import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import Button from "../input/Button";

interface BibleDialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

export default function BibleDialog({
  open,
  title,
  description,
  onClose,
  children,
  className,
}: BibleDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const originRef = useRef<HTMLElement | null>(null);
  const titleID = useId();
  const descriptionID = useId();

  useEffect(() => {
    if (!open) return;
    originRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
        ?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      window.setTimeout(() => originRef.current?.focus(), 0);
    };
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="ui-dialog-overlay"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={["ui-dialog", "bible-dialog", className].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleID}
        aria-describedby={description ? descriptionID : undefined}
      >
        <div className="ui-dialog__header bible-dialog__header">
          <div>
            <h2 id={titleID}>{title}</h2>
            {description && <p id={descriptionID}>{description}</p>}
          </div>
          <Button variant="action" size="icon" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </Button>
        </div>
        <div className="ui-dialog__body">{children}</div>
      </div>
    </div>,
    document.body
  );
}
