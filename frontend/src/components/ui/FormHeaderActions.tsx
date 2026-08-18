import { Check, Loader2, X } from "lucide-react";
import { Link } from "react-router-dom";
import "./FormHeaderActions.css";

interface FormHeaderActionsBaseProps {
  formId?: string;
  onConfirm?: () => void;
  cancelDisabled?: boolean;
  confirmDisabled?: boolean;
  saving?: boolean;
  cancelLabel?: string;
  confirmLabel?: string;
  className?: string;
}

type FormHeaderActionsProps = FormHeaderActionsBaseProps &
  ({ cancelTo: string; onCancel?: never } | { cancelTo?: never; onCancel: () => void });

/** Shared cancel/confirm pair for editor and creation form headers. */
export default function FormHeaderActions({
  formId,
  cancelTo,
  onCancel,
  onConfirm,
  cancelDisabled = false,
  confirmDisabled = false,
  saving = false,
  cancelLabel = "Cancel",
  confirmLabel = "Save",
  className = "",
}: FormHeaderActionsProps) {
  const cancelControl = cancelTo ? (
    <Link
      className="action-btn btn-close"
      to={cancelTo}
      title={cancelLabel}
      aria-label={cancelLabel}
    >
      <X size={20} />
    </Link>
  ) : (
    <button
      type="button"
      className="action-btn btn-close"
      onClick={onCancel}
      disabled={cancelDisabled || saving}
      title={cancelLabel}
      aria-label={cancelLabel}
    >
      <X size={20} />
    </button>
  );

  return (
    <div className={`form-header-actions${className ? ` ${className}` : ""}`}>
      {cancelControl}
      <button
        type={formId ? "submit" : "button"}
        form={formId}
        className="action-btn btn-submit"
        onClick={formId ? undefined : onConfirm}
        disabled={confirmDisabled || saving}
        title={confirmLabel}
        aria-label={confirmLabel}
      >
        {saving ? <Loader2 size={20} className="spin" /> : <Check size={20} />}
      </button>
    </div>
  );
}
