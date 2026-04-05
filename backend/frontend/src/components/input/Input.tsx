import "./Input.css";
import { Send } from "lucide-react";
import type * as React from "react";
import { useEffect, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";

interface InputProps {
  /** Called with the trimmed message text when the user submits. */
  handleSend: (input: string) => void;
  disabled?: boolean;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Placeholder text shown inside the textarea. */
  placeholder?: string;
  /** Minimum visible rows (default 1). */
  minRows?: number;
  /** Maximum visible rows before scrolling (default 6). */
  maxRows?: number;
  /** Maximum character length. */
  maxLength?: number;
  /** Compact mode for tight spaces like chat sidebars. */
  compact?: boolean;
}

const Input: React.FC<InputProps> = ({
  handleSend,
  disabled = false,
  children,
  className,
  style,
  placeholder = "Write a message…",
  minRows = 1,
  maxRows = 6,
  maxLength,
  compact = false,
}) => {
  const [message, setMessage] = useState("");
  const [inputFocus, setInputFocus] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (disabled) return;
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  const sendMessage = () => {
    if (!message.trim()) return;
    handleSend(message);
    setMessage("");
  };

  useEffect(() => {
    const handleFocus = () => setInputFocus(true);
    const handleBlur = () => setInputFocus(false);

    const shallowTextAreaRef = textAreaRef.current;
    shallowTextAreaRef?.addEventListener("focus", handleFocus);
    shallowTextAreaRef?.addEventListener("blur", handleBlur);

    const shallowWrapperRef = wrapperRef.current;
    shallowWrapperRef?.addEventListener("focus", handleFocus);
    shallowWrapperRef?.addEventListener("click", handleFocus);
    shallowWrapperRef?.addEventListener("mousedown", handleFocus);
    shallowWrapperRef?.addEventListener("touchstart", handleFocus);

    return () => {
      shallowTextAreaRef?.removeEventListener("focus", handleFocus);
      shallowTextAreaRef?.removeEventListener("blur", handleBlur);

      shallowWrapperRef?.removeEventListener("focus", handleFocus);
      shallowWrapperRef?.removeEventListener("click", handleFocus);
      shallowWrapperRef?.removeEventListener("mousedown", handleFocus);
      shallowWrapperRef?.removeEventListener("touchstart", handleFocus);
    };
  }, []);

  const wrapperClasses = [
    "composer-wrapper",
    inputFocus && "composer-wrapper--focused",
    compact && "composer-wrapper--compact",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div style={style} ref={wrapperRef} className={wrapperClasses}>
      <div className="composer-row">
        <TextareaAutosize
          ref={textAreaRef}
          disabled={disabled}
          className="composer-textarea"
          placeholder={placeholder}
          minRows={minRows}
          maxRows={maxRows}
          maxLength={maxLength}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label={placeholder}
        />
        {message.trim() && (
          <button
            type="button"
            className="composer-send-btn"
            onClick={sendMessage}
            disabled={disabled}
            title="Send"
            aria-label="Send message"
          >
            <Send size={compact ? 14 : 16} />
          </button>
        )}
      </div>
      {children && <div className="composer-extra">{children}</div>}
    </div>
  );
};

export default Input;
