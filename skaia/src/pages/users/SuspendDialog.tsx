import { Shield, X } from "lucide-react";

interface Props {
  displayName: string;
  suspendReason: string;
  setSuspendReason: (v: string) => void;
  suspendLoading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

const SuspendDialog = ({
  displayName,
  suspendReason,
  setSuspendReason,
  suspendLoading,
  onConfirm,
  onClose,
}: Props) => {
  return (
    <div className="up-dialog-overlay" onClick={onClose}>
      <div className="up-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="up-dialog-header up-dialog-header-danger">
          <h3>Suspend {displayName}?</h3>
          <button className="up-icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="up-dialog-body">
          <p className="up-dialog-warning">
            The user will no longer be able to log in until unsuspended.
          </p>
          <label className="up-field">
            <span>Reason (optional)</span>
            <textarea
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              rows={3}
              placeholder="Reason for suspension…"
            />
          </label>
        </div>

        <div className="up-dialog-footer">
          <button
            className="up-btn up-btn-secondary"
            onClick={onClose}
            disabled={suspendLoading}
          >
            Cancel
          </button>
          <button
            className="up-btn up-btn-danger"
            onClick={onConfirm}
            disabled={suspendLoading}
          >
            {suspendLoading ? (
              <span className="up-spinner" />
            ) : (
              <Shield size={14} />
            )}
            Confirm Suspend
          </button>
        </div>
      </div>
    </div>
  );
};

export default SuspendDialog;
