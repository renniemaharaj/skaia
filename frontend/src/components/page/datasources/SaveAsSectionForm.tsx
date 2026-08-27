import { Loader2, Save, X } from "lucide-react";
import Button from "../../ui/Button";
import { TextField } from "../../ui/TextField";
import { DATASOURCE_PREVIEW_TYPE_LABELS, type DataSourcePreviewType } from "./editorTypes";

export interface SaveAsSectionFormProps {
  sectionName: string;
  sectionDesc: string;
  onSectionNameChange: (value: string) => void;
  onSectionDescChange: (value: string) => void;
  previewType: DataSourcePreviewType;
  onClose: () => void;
  onSubmit: () => void;
  saving: boolean;
  editing: boolean;
}

export function SaveAsSectionForm({
  sectionName,
  sectionDesc,
  onSectionNameChange,
  onSectionDescChange,
  previewType,
  onClose,
  onSubmit,
  saving,
  editing,
}: SaveAsSectionFormProps) {
  return (
    <div className="ds-save-section">
      <div className="ds-save-section__header">
        <span>{editing ? "Edit Custom Section" : "Save as Custom Section"}</span>
        <Button variant="ghost" size="icon" onClick={onClose} title="Close" aria-label="Close">
          <X size={14} />
        </Button>
      </div>
      <div className="ds-save-section__body">
        <TextField
          label="Name"
          value={sectionName}
          onChange={event => onSectionNameChange(event.target.value)}
          placeholder="e.g. Recent Threads Grid"
        />
        <TextField
          label="Description"
          value={sectionDesc}
          onChange={event => onSectionDescChange(event.target.value)}
          placeholder="Optional"
        />
        <div className="ds-save-section__info">
          Type: <strong>{DATASOURCE_PREVIEW_TYPE_LABELS[previewType]}</strong>
        </div>
        <div className="ds-save-section__actions">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSubmit} disabled={saving || !sectionName.trim()}>
            {saving ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
            {saving ? "Saving…" : editing ? "Update Section" : "Save Section"}
          </Button>
        </div>
      </div>
    </div>
  );
}
