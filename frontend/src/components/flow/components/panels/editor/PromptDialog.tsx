import { useState } from "react";
import type { ReactNode } from "react";

const PromptDialog = ({
  trigger,
  confirmText,
  description,
  title,
  onConfirm,
  onCancel,
  type = "Info",
}: {
  trigger: ReactNode;
  confirmText: string;
  description: string;
  title: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  type?: "Info" | "Warning" | "Error";
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleConfirm = () => {
    if (onConfirm) onConfirm();
    setIsOpen(false);
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    setIsOpen(false);
  };

  return (
    <>
      <div onClick={() => setIsOpen(true)} className="cursor-pointer">
        {trigger}
      </div>
      {isOpen && (
        <div className="ui-dialog-overlay">
          <div className="ui-dialog" style={{ maxWidth: "400px" }}>
            <div className="ui-dialog__header">
              <h2 style={{ fontSize: "1.15rem", fontWeight: "bold", margin: 0 }}>{title}</h2>
            </div>
            <div className="ui-dialog__body">
              <p style={{ margin: 0, opacity: 0.8, fontSize: "0.95rem" }}>{description}</p>
            </div>
            <div className="ui-dialog__footer">
              <button className="btn btn-secondary" onClick={handleCancel}>
                Cancel
              </button>
              <button
                className={`btn ${type === "Error" || type === "Warning" ? "btn-danger" : "btn-primary"}`}
                onClick={handleConfirm}
              >
                {confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PromptDialog;
