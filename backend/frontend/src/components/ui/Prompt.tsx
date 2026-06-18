import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Button from "../input/Button";

export type PromptConfig = {
  message: string;
  defaultValue: string;
  placeholder?: string;
  isConfirm?: boolean;
  isAlert?: boolean;
  type?: string;
  resolve: (value: any) => void;
};

let setPromptConfigGlobal: ((config: PromptConfig | null) => void) | null = null;

export const customPrompt = (
  message: string,
  defaultValue = "",
  placeholder?: string,
  type?: string
): Promise<string | null> => {
  return new Promise(resolve => {
    if (setPromptConfigGlobal) {
      setPromptConfigGlobal({ message, defaultValue, placeholder, type, resolve });
    } else {
      resolve(null);
    }
  });
};

export const customConfirm = (message: string): Promise<boolean> => {
  return new Promise(resolve => {
    if (setPromptConfigGlobal) {
      setPromptConfigGlobal({ message, defaultValue: "", isConfirm: true, resolve });
    } else {
      resolve(false);
    }
  });
};

export const customAlert = (message: string): Promise<void> => {
  return new Promise(resolve => {
    if (setPromptConfigGlobal) {
      setPromptConfigGlobal({ message, defaultValue: "", isAlert: true, resolve });
    } else {
      resolve();
    }
  });
};

export const PromptContainer = () => {
  const [config, setConfig] = useState<PromptConfig | null>(null);
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPromptConfigGlobal = setConfig;
    return () => {
      if (setPromptConfigGlobal === setConfig) {
        setPromptConfigGlobal = null;
      }
    };
  }, []);

  useEffect(() => {
    if (config && !config.isConfirm && !config.isAlert && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [config]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!config) return;
      if (e.key === "Escape") {
        config.resolve(config.isConfirm ? false : null);
        setConfig(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [config]);

  if (!config) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    config.resolve(config.isConfirm ? true : value);
    setConfig(null);
  };

  const handleClose = () => {
    config.resolve(config.isConfirm ? false : null);
    setConfig(null);
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="ui-dialog-overlay"
      onMouseDown={e => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="ui-dialog" style={{ maxWidth: "420px" }}>
        <div
          className="ui-dialog__header"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "none",
            paddingBottom: "0",
          }}
        >
          <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600 }}>
            {config.isAlert ? "Notice" : config.isConfirm ? "Please Confirm" : "Input Required"}
          </h3>
          <button
            onClick={handleClose}
            type="button"
            className="btn-ghost"
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
        <form onSubmit={handleSubmit} className="compact-form-card">
          <div
            className="ui-dialog__body"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1.25rem",
              paddingTop: "0.5rem",
            }}
          >
            {!config.isConfirm && !config.isAlert ? (
              <label htmlFor="prompt-value">{config.message}</label>
            ) : (
              <p
                style={{
                  margin: 0,
                  color: "var(--text-secondary)",
                  fontSize: "0.95rem",
                  lineHeight: 1.6,
                }}
              >
                {config.message}
              </p>
            )}
            {!config.isConfirm && !config.isAlert && (
              <input
                id="prompt-value"
                ref={inputRef}
                type={config.type || "text"}
                value={value}
                onChange={e => setValue(e.target.value)}
                placeholder={config.placeholder}
                style={{ marginBottom: 0 }}
              />
            )}
          </div>
          <div className="ui-dialog__footer" style={{ borderTop: "none", paddingTop: "0" }}>
            {config.isAlert ? (
              <Button type="button" onClick={handleClose} variant="ghost" size="sm">
                Close
              </Button>
            ) : (
              <>
                <Button type="button" onClick={handleClose} variant="ghost" size="sm">
                  Cancel
                </Button>
                <Button type="submit" variant="primary" size="sm">
                  Confirm
                </Button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
