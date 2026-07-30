import { X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Button from "../input/Button";

export interface ConfirmOptions {
  title?: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  disabled?: boolean;
  typedConfirmation?: {
    value: string;
    label?: string;
    placeholder?: string;
  };
}

type PromptKind = "input" | "confirm" | "alert";
type PromptResult = string | boolean | null | undefined;

type PromptConfig = {
  kind: PromptKind;
  title: string;
  body: string;
  defaultValue?: string;
  placeholder?: string;
  inputType?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  disabled?: boolean;
  typedConfirmation?: ConfirmOptions["typedConfirmation"];
};

type PromptRequest = PromptConfig & {
  id: number;
  resolve: (value: PromptResult) => void;
};

let requestSequence = 0;
let enqueuePromptGlobal: ((request: PromptRequest) => void) | null = null;

function requestPrompt(config: PromptConfig): Promise<PromptResult> {
  return new Promise(resolve => {
    if (!enqueuePromptGlobal) {
      resolve(config.kind === "confirm" ? false : config.kind === "input" ? null : undefined);
      return;
    }
    enqueuePromptGlobal({ ...config, id: ++requestSequence, resolve });
  });
}

export function customPrompt(
  message: string,
  defaultValue = "",
  placeholder?: string,
  type?: string
): Promise<string | null> {
  return requestPrompt({
    kind: "input",
    title: "Input required",
    body: message,
    defaultValue,
    placeholder,
    inputType: type,
  }) as Promise<string | null>;
}

export function customConfirm(messageOrOptions: string | ConfirmOptions): Promise<boolean> {
  const options =
    typeof messageOrOptions === "string" ? { body: messageOrOptions } : messageOrOptions;
  return requestPrompt({
    kind: "confirm",
    title: options.title ?? (options.destructive ? "Confirm deletion" : "Please confirm"),
    body: options.body,
    confirmLabel: options.confirmLabel ?? "Confirm",
    cancelLabel: options.cancelLabel ?? "Cancel",
    destructive: options.destructive,
    pending: options.pending,
    disabled: options.disabled,
    typedConfirmation: options.typedConfirmation,
  }) as Promise<boolean>;
}

export function confirmDestructiveAction(options: Omit<ConfirmOptions, "destructive">) {
  return customConfirm({ ...options, destructive: true });
}

export function customAlert(message: string): Promise<void> {
  return requestPrompt({
    kind: "alert",
    title: "Notice",
    body: message,
  }) as Promise<void>;
}

function cancelValue(kind: PromptKind): PromptResult {
  if (kind === "confirm") return false;
  if (kind === "input") return null;
  return undefined;
}

export function PromptContainer() {
  const [queue, setQueue] = useState<PromptRequest[]>([]);
  const [value, setValue] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const originFocusRef = useRef<HTMLElement | null>(null);
  const queueLengthRef = useRef(0);
  const titleID = useId();
  const descriptionID = useId();
  const config = queue[0] ?? null;

  useEffect(() => {
    enqueuePromptGlobal = request => {
      if (queueLengthRef.current === 0) {
        originFocusRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      queueLengthRef.current += 1;
      setQueue(current => [...current, request]);
    };
    return () => {
      enqueuePromptGlobal = null;
      setQueue(current => {
        current.forEach(request => request.resolve(cancelValue(request.kind)));
        queueLengthRef.current = 0;
        return [];
      });
    };
  }, []);

  useEffect(() => {
    if (!config) return;
    setValue(config.defaultValue ?? "");
    const timer = window.setTimeout(() => {
      (config.kind === "input" || config.typedConfirmation
        ? inputRef.current
        : cancelRef.current
      )?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [config?.id]);

  const finish = (result: PromptResult) => {
    if (!config) return;
    config.resolve(result);
    queueLengthRef.current = Math.max(0, queueLengthRef.current - 1);
    setQueue(current => current.slice(1));
    if (queueLengthRef.current === 0) {
      window.setTimeout(() => originFocusRef.current?.focus(), 0);
    }
  };

  useEffect(() => {
    if (!config) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !config.pending) {
        event.preventDefault();
        finish(cancelValue(config.kind));
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
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
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [config?.id, config?.pending]);

  if (!config || typeof document === "undefined") return null;

  const typedValueMatches =
    !config.typedConfirmation || value.trim() === config.typedConfirmation.value;
  const confirmDisabled = !!config.disabled || !!config.pending || !typedValueMatches;
  const close = () => {
    if (!config.pending) finish(cancelValue(config.kind));
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (confirmDisabled && config.kind === "confirm") return;
    finish(config.kind === "confirm" ? true : value);
  };

  return createPortal(
    <div
      className="ui-dialog-overlay"
      onMouseDown={event => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        ref={dialogRef}
        className="ui-dialog"
        style={{ maxWidth: "440px" }}
        role={config.kind === "confirm" && config.destructive ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={titleID}
        aria-describedby={descriptionID}
      >
        <div
          className="ui-dialog__header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "none",
            paddingBottom: 0,
          }}
        >
          <h3 id={titleID} style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600 }}>
            {config.title}
          </h3>
          <button
            onClick={close}
            type="button"
            className="btn-ghost"
            aria-label="Close dialog"
            disabled={config.pending}
            style={{
              padding: "0.35rem",
              borderRadius: "var(--radius-md)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "none",
            }}
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="compact-form-card">
          <div
            className="ui-dialog__body"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
              paddingTop: "0.5rem",
            }}
          >
            <p
              id={descriptionID}
              style={{
                margin: 0,
                color: "var(--text-secondary)",
                fontSize: "0.95rem",
                lineHeight: 1.6,
              }}
            >
              {config.body}
            </p>
            {(config.kind === "input" || config.typedConfirmation) && (
              <label htmlFor="prompt-value">
                {config.typedConfirmation?.label ??
                  (config.kind === "input"
                    ? config.body
                    : `Type ${config.typedConfirmation?.value} to continue`)}
                <input
                  id="prompt-value"
                  ref={inputRef}
                  type={config.inputType || "text"}
                  value={value}
                  onChange={event => setValue(event.target.value)}
                  placeholder={
                    config.typedConfirmation?.placeholder ??
                    config.typedConfirmation?.value ??
                    config.placeholder
                  }
                  disabled={config.pending}
                  autoComplete="off"
                  style={{ marginBottom: 0, marginTop: "0.45rem" }}
                />
              </label>
            )}
          </div>
          <div className="ui-dialog__footer" style={{ borderTop: "none", paddingTop: 0 }}>
            {config.kind === "alert" ? (
              <Button ref={cancelRef} type="button" onClick={close} variant="primary" size="sm">
                Close
              </Button>
            ) : (
              <>
                <Button
                  ref={cancelRef}
                  type="button"
                  onClick={close}
                  variant="ghost"
                  size="sm"
                  disabled={config.pending}
                >
                  {config.cancelLabel ?? "Cancel"}
                </Button>
                <Button
                  type="submit"
                  variant={config.destructive ? "danger" : "primary"}
                  size="sm"
                  disabled={confirmDisabled}
                  loading={config.pending}
                >
                  {config.confirmLabel ?? (config.kind === "input" ? "Submit" : "Confirm")}
                </Button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
