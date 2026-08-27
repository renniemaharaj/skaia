import {
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  Clock,
  Eye,
  FileJson,
  LayoutGrid,
  Pencil,
  Play,
} from "lucide-react";
import type { CSSProperties, Dispatch, SetStateAction } from "react";
import { cacheTTLLabel, formatTimeAgo } from "../../../utils/cache";
import Button from "../../ui/Button";
import Select from "../../ui/Select";
import { ComponentGroupEditor, ComponentGroupRenderer } from "../ComponentGroupEditor";
import { EventHookEditor } from "../EventHookEditor";
import type { ComponentDefinition, ComponentGroup, CustomSection, EventHook } from "../types";
import type { DataSourceDiagnostic } from "./datasourcePreview";
import { FetchLogPanel, RunSummaryCard } from "./DataSourceRunPanels";
import { SaveAsSectionForm } from "./SaveAsSectionForm";
import type { DataSourcePreviewItem, DataSourceRunStats } from "./editorTypes";

export type DataSourceResultPanel = "preview" | "compiled" | "diagnostics";

interface DataSourceResultsPanelProps {
  activePanel: DataSourceResultPanel;
  onActivePanelChange: (panel: DataSourceResultPanel) => void;
  previewItems: DataSourcePreviewItem[];
  diagnostics: DataSourceDiagnostic[];
  compiledJS: string | null;
  evalError: string | null;
  runStats: DataSourceRunStats | null;
  expandedFetch: Set<number>;
  onToggleFetch: (index: number) => void;
  lastRunAt: Date | null;
  cacheTTL: number;
  isNew: boolean;
  savedSections: CustomSection[];
  editingSectionId: number | null;
  onSelectSection: (section: CustomSection) => void;
  onNewSection: () => void;
  showSaveSection: boolean;
  onToggleSaveSection: () => void;
  sectionName: string;
  sectionDesc: string;
  onSectionNameChange: (value: string) => void;
  onSectionDescChange: (value: string) => void;
  onCloseSaveSection: () => void;
  onSaveSection: () => void;
  savingSection: boolean;
  componentWorkspace: boolean;
  componentGroup: ComponentGroup;
  componentsList: ComponentDefinition[];
  tableColumns: string[];
  componentHooks: EventHook[];
  setComponentGroup: Dispatch<SetStateAction<ComponentGroup>>;
  setComponentWorkspace: Dispatch<SetStateAction<boolean>>;
  setComponentHooks: Dispatch<SetStateAction<EventHook[]>>;
}

export function DataSourceResultsPanel({
  activePanel,
  onActivePanelChange,
  previewItems,
  diagnostics,
  compiledJS,
  evalError,
  runStats,
  expandedFetch,
  onToggleFetch,
  lastRunAt,
  cacheTTL,
  isNew,
  savedSections,
  editingSectionId,
  onSelectSection,
  onNewSection,
  showSaveSection,
  onToggleSaveSection,
  sectionName,
  sectionDesc,
  onSectionNameChange,
  onSectionDescChange,
  onCloseSaveSection,
  onSaveSection,
  savingSection,
  componentWorkspace,
  componentGroup,
  componentsList,
  tableColumns,
  componentHooks,
  setComponentGroup,
  setComponentWorkspace,
  setComponentHooks,
}: DataSourceResultsPanelProps) {
  const issuesBadgeCount = diagnostics.length + (evalError ? 1 : 0);
  const hasIssues = issuesBadgeCount > 0;

  const runDetails = runStats && (
    <>
      <RunSummaryCard runStats={runStats} />
      {runStats.fetchLog.length > 0 && (
        <FetchLogPanel
          fetchLog={runStats.fetchLog}
          expandedFetch={expandedFetch}
          onToggle={onToggleFetch}
        />
      )}
    </>
  );

  return (
    <div className="ds-editor__results-panel">
      <div className="ds-editor__panel-tabs">
        <Button
          unstyled
          className={`ds-editor__tab ${activePanel === "preview" ? "ds-editor__tab--active" : ""}`}
          onClick={() => onActivePanelChange("preview")}
        >
          <Eye size={13} /> Preview
          {previewItems.length > 0 && (
            <span className="ds-editor__tab-badge">{previewItems.length}</span>
          )}
        </Button>
        <Button
          unstyled
          className={`ds-editor__tab ${activePanel === "compiled" ? "ds-editor__tab--active" : ""}`}
          onClick={() => onActivePanelChange("compiled")}
        >
          <FileJson size={13} /> Compiled JS
        </Button>
        <Button
          unstyled
          className={`ds-editor__tab ${activePanel === "diagnostics" ? "ds-editor__tab--active" : ""}`}
          onClick={() => onActivePanelChange("diagnostics")}
        >
          <AlertTriangle size={13} /> Issues
          {hasIssues && (
            <span className="ds-editor__tab-badge ds-editor__tab-badge--warn">
              {issuesBadgeCount || "!"}
            </span>
          )}
        </Button>
        {lastRunAt && (
          <div className="ds-editor__last-updated">
            <Clock size={11} />
            <span>Updated {formatTimeAgo(lastRunAt)}</span>
            {cacheTTL > 0 && (
              <span className="ds-editor__cache-badge">{cacheTTLLabel(cacheTTL)}</span>
            )}
          </div>
        )}
      </div>

      <div className="ds-editor__panel-content">
        {activePanel === "preview" && (
          <div className="ds-editor__preview">
            {previewItems.length > 0 && (
              <div className="ds-preview__toolbar">
                <div className="ds-preview__type-tabs">
                  <Button unstyled className="ds-preview__type-tab ds-preview__type-tab--active">
                    <LayoutGrid size={13} /> Component Registry
                  </Button>
                </div>
                {!isNew && (
                  <Select
                    className="ds-preview__saved-section-select"
                    value={editingSectionId ?? ""}
                    onChange={event => {
                      const sectionId = Number(event.target.value);
                      const section = savedSections.find(item => item.id === sectionId);
                      if (section) onSelectSection(section);
                      else onNewSection();
                    }}
                    size="sm"
                    aria-label="Saved section design"
                  >
                    <option value="">New section design</option>
                    {savedSections.map(section => (
                      <option key={section.id} value={section.id}>
                        {section.name}
                      </option>
                    ))}
                  </Select>
                )}
                {!isNew && (
                  <Button
                    unstyled
                    className="ds-preview__save-section-btn"
                    onClick={onToggleSaveSection}
                  >
                    {editingSectionId ? <Pencil size={13} /> : <Bookmark size={13} />}
                    {editingSectionId ? "Edit Section" : "Save as Section"}
                  </Button>
                )}
              </div>
            )}
            {showSaveSection && (
              <SaveAsSectionForm
                sectionName={sectionName}
                sectionDesc={sectionDesc}
                onSectionNameChange={onSectionNameChange}
                onSectionDescChange={onSectionDescChange}
                previewType="component"
                onClose={onCloseSaveSection}
                onSubmit={onSaveSection}
                saving={savingSection}
                editing={editingSectionId !== null}
              />
            )}
            {runDetails}
            {previewItems.length === 0 && !evalError && (
              <div className="ds-editor__preview-empty">
                <Play size={32} />
                <p>Click "Run" to evaluate the data source and preview results.</p>
              </div>
            )}
            {evalError && (
              <div className="ds-editor__error">
                <AlertTriangle size={16} />
                <pre>{evalError}</pre>
              </div>
            )}
            {previewItems.length > 0 && !componentWorkspace && (
              <div className="ds-component-picker">
                <ComponentGroupEditor
                  group={componentGroup}
                  components={componentsList}
                  availableColumns={tableColumns}
                  firstRow={previewItems[0] || null}
                  onChange={setComponentGroup}
                  onWorkspaceModeChange={setComponentWorkspace}
                />
                <div className="ds-component-picker__hooks">
                  <EventHookEditor hooks={componentHooks} onChange={setComponentHooks} />
                </div>
              </div>
            )}
            {previewItems.length > 0 && (
              <div
                className="ds-component-preview"
                style={{ "--ds-component-gap": `${componentGroup.gap}px` } as CSSProperties}
              >
                {previewItems.map((row, index) => (
                  <ComponentGroupRenderer
                    key={index}
                    group={componentGroup}
                    components={componentsList}
                    row={row}
                  />
                ))}
              </div>
            )}
          </div>
        )}
        {activePanel === "compiled" && (
          <div className="ds-editor__compiled">
            {compiledJS ? (
              <pre className="ds-editor__compiled-code">{compiledJS}</pre>
            ) : (
              <div className="ds-editor__preview-empty">
                <FileJson size={32} />
                <p>Run the data source to see compiled JavaScript output.</p>
              </div>
            )}
          </div>
        )}
        {activePanel === "diagnostics" && (
          <div className="ds-editor__diagnostics">
            {!runStats && diagnostics.length === 0 && !evalError && (
              <div className="ds-editor__preview-empty">
                <CheckCircle2 size={32} />
                <p>No issues. Run the data source to check for errors.</p>
              </div>
            )}
            {runDetails}
            {evalError && (
              <div className="ds-editor__error">
                <AlertTriangle size={16} />
                <pre>{evalError}</pre>
              </div>
            )}
            {diagnostics.map((diagnostic, index) => (
              <div
                key={index}
                className={`ds-diagnostic ${diagnostic.category === 1 ? "ds-diagnostic--error" : "ds-diagnostic--warn"}`}
              >
                <span className="ds-diagnostic__location">
                  {diagnostic.file ? `${diagnostic.file} ` : ""}Ln {diagnostic.line}, Col{" "}
                  {diagnostic.col}
                </span>
                <span className="ds-diagnostic__message">{diagnostic.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
