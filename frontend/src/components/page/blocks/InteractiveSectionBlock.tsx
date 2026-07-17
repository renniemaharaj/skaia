import { useAtomValue } from "jotai";
import { Field, FieldArray, Form, Formik, type FormikHelpers, useField } from "formik";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { currentUserAtom, isAuthenticatedAtom } from "../../../atoms/auth";
import FormikSelect from "../../formik/FormikSelect";
import Button from "../../input/Button";
import { TableView, type TableColumn } from "../../ui/TableView/TableView";
import { customConfirm } from "../../ui/Prompt";
import StarRating from "../../ui/StarRating";
import { apiRequest } from "../../../utils/api";
import {
  INTERACTIVE_FIELD_TYPES,
  type InteractiveConfig,
  type InteractiveField,
  type InteractiveFieldType,
  type InteractiveRecord,
  type InteractiveSectionType,
  initialInteractiveValues,
  interactiveResponseLimitReached,
  interactiveResultEntries,
  normalizeInteractiveAnswers,
  parseInteractiveConfig,
  validateInteractiveValues,
} from "../interactiveTypes";
import { usePageBuilderContext } from "../PageBuilderContext";
import type { PageSection } from "../types";
import {
  EditableText,
  SectionToolbar,
  getSectionAnimation,
  getSectionAnimationIntensity,
  getSectionLayout,
  getSectionMargins,
  setSectionAnimation,
  setSectionAnimationIntensity,
  setSectionLayout,
  setSectionMargins,
} from "../EditControls";
import "./InteractiveSectionBlock.css";

interface Props {
  section: PageSection;
  canEdit: boolean;
  onUpdate: (section: PageSection) => void;
  onDelete: (id: number) => void;
}

type Tab = "preview" | "responses" | "results" | "design";

const choiceField = (type: InteractiveFieldType) =>
  type === "radio" || type === "select" || type === "multi_select";

const displayValue = (value: unknown) => {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value == null || value === "" ? "—" : String(value);
};

function FormikStarRating({
  name,
  maxRating,
  disabled,
}: {
  name: string;
  maxRating: number;
  disabled: boolean;
}) {
  const [field, , helpers] = useField(name);
  return (
    <StarRating
      rating={Number(field.value) || 0}
      maxRating={maxRating}
      size={20}
      disabled={disabled}
      onChange={rating => helpers.setValue(rating)}
    />
  );
}

function FieldControl({
  field,
  disabled = false,
}: { field: InteractiveField; disabled?: boolean }) {
  const label = `${field.label}${field.required ? " *" : ""}`;
  if (field.type === "rating") {
    return (
      <div className="interactive-field interactive-field--rating">
        <span>{label}</span>
        <FormikStarRating
          name={field.key}
          maxRating={Math.max(1, Math.min(field.max ?? 5, 10))}
          disabled={disabled}
        />
        {field.description && <small>{field.description}</small>}
      </div>
    );
  }
  if (field.type === "textarea") {
    return (
      <label className="interactive-field interactive-field--wide">
        <span>{label}</span>
        <Field
          as="textarea"
          name={field.key}
          rows={3}
          placeholder={field.placeholder}
          disabled={disabled}
        />
        {field.description && <small>{field.description}</small>}
      </label>
    );
  }
  if (field.type === "select") {
    return (
      <div className="interactive-field interactive-field--compact">
        <span>{label}</span>
        <FormikSelect
          name={field.key}
          size="sm"
          disabled={disabled}
          options={[
            { value: "", label: "Select" },
            ...(field.options ?? []).map(option => ({ value: option.key, label: option.label })),
          ]}
        />
      </div>
    );
  }
  if (field.type === "radio" || field.type === "multi_select") {
    return (
      <fieldset className="interactive-field interactive-field--choices">
        <legend>{label}</legend>
        {(field.options ?? []).map(option => (
          <label key={option.key} className="interactive-choice">
            <Field
              type={field.type === "radio" ? "radio" : "checkbox"}
              name={field.key}
              value={option.key}
              disabled={disabled}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
    );
  }
  if (field.type === "checkbox" || field.type === "consent") {
    return (
      <label className="interactive-field interactive-check">
        <Field type="checkbox" name={field.key} disabled={disabled} />
        <span>{label}</span>
      </label>
    );
  }
  const numeric = field.type === "scale" || field.type === "nps";
  const inputType = numeric ? "number" : field.type === "phone" ? "tel" : field.type;
  return (
    <label
      className={`interactive-field ${numeric || field.type === "date" || field.type === "time" ? "interactive-field--compact" : ""}`}
    >
      <span>{label}</span>
      <Field
        type={inputType}
        name={field.key}
        placeholder={field.placeholder}
        min={field.min ?? (numeric ? 1 : undefined)}
        max={field.max ?? (field.type === "nps" ? 10 : numeric ? 5 : undefined)}
        disabled={disabled}
      />
      {field.description && <small>{field.description}</small>}
    </label>
  );
}

function RecordDetail({
  record,
  fields,
}: { record: InteractiveRecord; fields: InteractiveField[] }) {
  return (
    <div className="interactive-record-detail" aria-label="Submitted response">
      {fields.map(field => (
        <div key={field.key} className="interactive-record-value">
          <span>{field.label}</span>
          <div aria-disabled="true">{displayValue(record.answers[field.key])}</div>
        </div>
      ))}
      {record.answer && (
        <div className="interactive-record-value interactive-record-value--wide">
          <span>Answer</span>
          <div aria-disabled="true">{record.answer}</div>
        </div>
      )}
    </div>
  );
}

function QAAnswerForm({
  record,
  onSave,
}: {
  record: InteractiveRecord;
  onSave: (values: { answer: string; status: string; pinned: boolean }) => Promise<void>;
}) {
  return (
    <Formik
      initialValues={{
        answer: record.answer ?? "",
        status: record.status,
        pinned: !!record.pinned,
      }}
      enableReinitialize
      onSubmit={async (values, helpers) => {
        await onSave(values);
        helpers.setSubmitting(false);
      }}
    >
      {({ isSubmitting }) => (
        <Form className="interactive-moderation-form">
          <Field as="textarea" name="answer" rows={2} placeholder="Write an answer" />
          <FormikSelect
            name="status"
            size="sm"
            options={[
              { value: "pending", label: "Pending" },
              { value: "published", label: "Published" },
              { value: "answered", label: "Answered" },
              { value: "archived", label: "Archived" },
            ]}
          />
          <label className="interactive-check">
            <Field type="checkbox" name="pinned" />
            <span>Pinned</span>
          </label>
          <Button type="submit" size="sm" disabled={isSubmitting}>
            Save
          </Button>
        </Form>
      )}
    </Formik>
  );
}

export function ResultsView({ config }: { config: InteractiveConfig }) {
  const summary = config.result_summary;
  if (!summary) return <div className="interactive-empty">Results are not available yet.</div>;
  return (
    <div className="interactive-results">
      <div className="interactive-total">
        <strong>{summary.total}</strong>
        <span>responses</span>
      </div>
      {config.fields.map(field => {
        const counts = summary.counts?.[field.key];
        if (!counts) return null;
        const entries = interactiveResultEntries(field, counts);
        if (entries.length === 0) return null;
        return (
          <div key={field.key} className="interactive-result-group">
            <strong>{field.label}</strong>
            {entries.map(([value, label]) => {
              const count = counts[value] ?? 0;
              const percent = summary.total ? Math.round((count / summary.total) * 100) : 0;
              return (
                <div key={value} className="interactive-result-row">
                  <span>{label}</span>
                  <div className="interactive-result-track">
                    <i style={{ width: `${percent}%` }} />
                  </div>
                  <b>
                    {count} · {percent}%
                  </b>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

interface DesignerField extends InteractiveField {
  options_text: string;
}
interface DesignerValues {
  status: "open" | "closed";
  submit_label: string;
  success_text: string;
  result_visibility: "never" | "after_participation" | "always";
  response_limit: number;
  moderation: boolean;
  fields: DesignerField[];
}

const designerValues = (config: InteractiveConfig): DesignerValues => ({
  status: config.status,
  submit_label: config.submit_label,
  success_text: config.success_text,
  result_visibility: config.result_visibility,
  response_limit: config.response_limit,
  moderation: !!config.moderation,
  fields: config.fields.map(field => ({
    ...field,
    options_text: (field.options ?? []).map(option => option.label).join("\n"),
  })),
});

function DesignView({
  config,
  onSave,
}: { config: InteractiveConfig; onSave: (config: InteractiveConfig) => void }) {
  return (
    <Formik
      initialValues={designerValues(config)}
      enableReinitialize
      onSubmit={values => {
        const fields = values.fields.map(({ options_text, ...field }) => ({
          ...field,
          options: choiceField(field.type)
            ? options_text
                .split("\n")
                .map(value => value.trim())
                .filter(Boolean)
                .map((label, index) => ({
                  key: field.options?.[index]?.key ?? `${field.key}-option-${index + 1}`,
                  label,
                }))
            : undefined,
        }));
        onSave({ ...config, ...values, fields, records: config.records });
      }}
    >
      {({ values }) => (
        <Form className="interactive-designer">
          <div className="interactive-designer-settings">
            <FormikSelect
              name="status"
              size="sm"
              options={[
                { value: "open", label: "Open" },
                { value: "closed", label: "Closed" },
              ]}
            />
            <FormikSelect
              name="result_visibility"
              size="sm"
              options={[
                { value: "never", label: "Hide results" },
                { value: "after_participation", label: "After participation" },
                { value: "always", label: "Always show" },
              ]}
            />
            <label>
              <span>Button label</span>
              <Field name="submit_label" />
            </label>
            <label>
              <span>Response limit</span>
              <Field type="number" min="0" name="response_limit" />
            </label>
            <label className="interactive-designer-success">
              <span>Success message</span>
              <Field name="success_text" />
            </label>
          </div>
          <FieldArray name="fields">
            {({ push, remove }) => (
              <div className="interactive-field-list">
                {values.fields.map((field, index) => (
                  <div className="interactive-field-editor" key={field.key}>
                    <Field type="hidden" name={`fields.${index}.key`} />
                    <label>
                      <span>Label</span>
                      <Field name={`fields.${index}.label`} />
                    </label>
                    <label>
                      <span>Placeholder</span>
                      <Field name={`fields.${index}.placeholder`} placeholder="Optional" />
                    </label>
                    <FormikSelect
                      name={`fields.${index}.type`}
                      size="sm"
                      options={INTERACTIVE_FIELD_TYPES}
                    />
                    <label className="interactive-check">
                      <Field type="checkbox" name={`fields.${index}.required`} />
                      <span>Required</span>
                    </label>
                    {choiceField(field.type) && (
                      <label className="interactive-options">
                        <span>Options · one per line</span>
                        <Field as="textarea" rows={2} name={`fields.${index}.options_text`} />
                      </label>
                    )}
                    <Button
                      unstyled
                      type="button"
                      className="interactive-icon-btn"
                      title="Remove field"
                      onClick={() => remove(index)}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="interactive-add-field"
                  onClick={() =>
                    push({
                      key: `field-${Date.now()}`,
                      type: "text",
                      label: "New field",
                      required: false,
                      options_text: "",
                    })
                  }
                >
                  <Plus size={14} /> Add field
                </Button>
              </div>
            )}
          </FieldArray>
          <div className="interactive-designer-actions">
            <Button type="submit" size="sm">
              Apply design
            </Button>
          </div>
        </Form>
      )}
    </Formik>
  );
}

export function InteractiveSectionBlock({ section, canEdit, onUpdate, onDelete }: Props) {
  const type = section.section_type as InteractiveSectionType;
  const initialConfig = useMemo(
    () => parseInteractiveConfig(section.config, type),
    [section.config, type]
  );
  const [config, setConfig] = useState(initialConfig);
  const [tab, setTab] = useState<Tab>("preview");
  const [expanded, setExpanded] = useState<string | null>(null);
  const submissionRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const { pageId, canManagePage } = usePageBuilderContext();
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);
  const currentUser = useAtomValue(currentUserAtom);

  useEffect(() => setConfig(initialConfig), [initialConfig]);

  const ownRecords = config.records.filter(
    record => String(record.user_id) === String(currentUser?.id)
  );
  const alreadyParticipated = ownRecords.length > 0;
  const participationLocked =
    config.status === "closed" ||
    interactiveResponseLimitReached(type, config.response_limit, ownRecords.length);

  const replaceRuntimeConfig = (raw: string) => setConfig(parseInteractiveConfig(raw, type));
  const persistDesign = (next: InteractiveConfig) => {
    const { result_summary: _summary, ...stored } = next;
    setConfig(next);
    onUpdate({ ...section, config: JSON.stringify(stored) });
  };

  const submit = async (
    values: Record<string, unknown>,
    helpers: FormikHelpers<Record<string, unknown>>
  ) => {
    if (!pageId || !isAuthenticated) {
      toast.error("Sign in to participate");
      helpers.setSubmitting(false);
      return;
    }
    const answers = normalizeInteractiveAnswers(config.fields, values);
    const fingerprint = JSON.stringify(answers);
    if (!submissionRef.current || submissionRef.current.fingerprint !== fingerprint) {
      submissionRef.current = { fingerprint, key: crypto.randomUUID() };
    }
    try {
      const response = await apiRequest<{ config: string }>(
        `/pages/${pageId}/sections/${section.id}/responses`,
        {
          method: "POST",
          body: JSON.stringify({ answers, idempotency_key: submissionRef.current.key }),
        }
      );
      replaceRuntimeConfig(response.config);
      submissionRef.current = null;
      helpers.resetForm();
      toast.success(config.success_text);
      if (type === "poll" || type === "vote") setTab("results");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit response");
    } finally {
      helpers.setSubmitting(false);
    }
  };

  const deleteRecord = async (record: InteractiveRecord) => {
    if (!pageId || !(await customConfirm("Delete this submitted record?"))) return;
    try {
      const response = await apiRequest<{ config: string }>(
        `/pages/${pageId}/sections/${section.id}/responses/${record.id}`,
        { method: "DELETE" }
      );
      replaceRuntimeConfig(response.config);
      if (expanded === record.id) setExpanded(null);
      toast.success("Record deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete record");
    }
  };

  const moderate = async (
    record: InteractiveRecord,
    values: { answer: string; status: string; pinned: boolean }
  ) => {
    if (!pageId) return;
    try {
      const response = await apiRequest<{ config: string }>(
        `/pages/${pageId}/sections/${section.id}/responses/${record.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(values),
        }
      );
      replaceRuntimeConfig(response.config);
      toast.success("Question updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update question");
    }
  };

  const columns: TableColumn<InteractiveRecord>[] = [
    {
      id: "expand",
      header: "",
      width: "2rem",
      cell: record => (
        <Button
          unstyled
          type="button"
          className="interactive-icon-btn"
          onClick={() => setExpanded(expanded === record.id ? null : record.id)}
          aria-label="Toggle response details"
        >
          {expanded === record.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </Button>
      ),
    },
    {
      id: "submitted",
      header: "Submitted",
      width: "9rem",
      cell: record => new Date(record.submitted_at).toLocaleString(),
    },
    {
      id: "respondent",
      header: "Respondent",
      width: "minmax(8rem, 1fr)",
      cell: record => record.respondent_name || "Anonymous",
    },
    {
      id: "summary",
      header: type === "qa" ? "Question" : "Summary",
      width: "minmax(12rem, 2fr)",
      cell: record => displayValue(record.answers[config.fields[0]?.key]),
    },
    {
      id: "status",
      header: "Status",
      width: "6rem",
      cell: record => (
        <span className={`interactive-status interactive-status--${record.status}`}>
          {record.status}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      width: "2rem",
      cell: record => (
        <Button
          unstyled
          type="button"
          className="interactive-icon-btn interactive-icon-btn--danger"
          title="Delete record"
          onClick={() => void deleteRecord(record)}
        >
          <Trash2 size={14} />
        </Button>
      ),
    },
  ];

  const publicQA =
    type === "qa"
      ? config.records.filter(
          record =>
            record.status === "published" ||
            record.status === "answered" ||
            String(record.user_id) === String(currentUser?.id)
        )
      : [];
  const tabs: { id: Tab; label: string }[] = canManagePage
    ? [
        { id: "preview", label: "Preview" },
        { id: "responses", label: type === "qa" ? "Moderation" : "Responses" },
        { id: "results", label: "Results" },
        { id: "design", label: "Design" },
      ]
    : canEdit
      ? [
          { id: "preview", label: "Preview" },
          { id: "design", label: "Design" },
        ]
      : [
          { id: "preview", label: alreadyParticipated ? "Participation" : "Participate" },
          ...(config.result_summary ? [{ id: "results" as const, label: "Results" }] : []),
        ];

  return (
    <section className="interactive-section">
      {canEdit && (
        <SectionToolbar
          onDelete={() => onDelete(section.id)}
          label={
            type === "qa" ? "Questions & Answers" : type.charAt(0).toUpperCase() + type.slice(1)
          }
          layout={getSectionLayout(section.config)}
          onLayoutChange={layout =>
            onUpdate({ ...section, config: setSectionLayout(section.config, layout) })
          }
          margins={getSectionMargins(section.config)}
          onMarginsChange={margins =>
            onUpdate({ ...section, config: setSectionMargins(section.config, margins) })
          }
          animation={getSectionAnimation(section.config)}
          onAnimationChange={animation =>
            onUpdate({ ...section, config: setSectionAnimation(section.config, animation) })
          }
          animationIntensity={getSectionAnimationIntensity(section.config)}
          onAnimationIntensityChange={intensity =>
            onUpdate({
              ...section,
              config: setSectionAnimationIntensity(section.config, intensity),
            })
          }
        />
      )}
      <header className="interactive-heading">
        <div>
          <span>{type === "qa" ? "Questions & answers" : type}</span>
          {canEdit ? (
            <EditableText
              value={section.heading}
              onSave={heading => onUpdate({ ...section, heading })}
              tag="h2"
            />
          ) : (
            <h2>{section.heading}</h2>
          )}
          {canEdit ? (
            <EditableText
              value={section.subheading}
              onSave={subheading => onUpdate({ ...section, subheading })}
              tag="p"
              placeholder="Optional description"
            />
          ) : (
            section.subheading && <p>{section.subheading}</p>
          )}
        </div>
        <span className={`interactive-open-state interactive-open-state--${config.status}`}>
          {config.status}
        </span>
      </header>
      <div className="interactive-tabs" role="tablist" aria-label={`${section.heading} views`}>
        {tabs.map(item => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? "active" : ""}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "preview" && (
        <div className="interactive-preview">
          {participationLocked && (
            <div className="interactive-notice">
              {config.status === "closed"
                ? "This section is closed."
                : "Your response has been recorded."}
            </div>
          )}
          {!participationLocked && (
            <Formik
              initialValues={initialInteractiveValues(config.fields)}
              validate={values => validateInteractiveValues(config.fields, values)}
              onSubmit={submit}
            >
              {({ errors, touched, isSubmitting }) => (
                <Form className="interactive-form">
                  <div className="interactive-form-grid">
                    {config.fields.map(field => (
                      <div key={field.key}>
                        <FieldControl field={field} />
                        {touched[field.key] && errors[field.key] && (
                          <span className="interactive-error">{String(errors[field.key])}</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {type === "vote" && (
                    <div className="interactive-ballot-note">
                      Review your selection carefully. A submitted ballot cannot be edited.
                    </div>
                  )}
                  <Button type="submit" size="sm" disabled={isSubmitting || !isAuthenticated}>
                    {isAuthenticated ? config.submit_label : "Sign in to participate"}
                  </Button>
                </Form>
              )}
            </Formik>
          )}
          {type === "qa" && publicQA.length > 0 && (
            <div className="interactive-qa-feed">
              {publicQA
                .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned))
                .map(record => (
                  <article key={record.id}>
                    <small>
                      {record.pinned ? "Pinned · " : ""}
                      {record.respondent_name || "Community member"} ·{" "}
                      {new Date(record.submitted_at).toLocaleDateString()}
                    </small>
                    <h3>{displayValue(record.answers.question)}</h3>
                    {record.answer && <p>{record.answer}</p>}
                    {record.status === "pending" && (
                      <span className="interactive-status">Awaiting moderation</span>
                    )}
                  </article>
                ))}
            </div>
          )}
        </div>
      )}

      {tab === "responses" && canManagePage && (
        <div className="interactive-responses">
          <TableView
            data={config.records}
            columns={columns}
            rowKey={record => record.id}
            chrome="embedded"
            lazyRows={false}
            emptyState={<div className="interactive-empty">No responses yet.</div>}
          />
          {expanded &&
            (() => {
              const record = config.records.find(item => item.id === expanded);
              if (!record) return null;
              return (
                <div className="interactive-expanded">
                  <RecordDetail record={record} fields={config.fields} />
                  {type === "qa" && (
                    <QAAnswerForm record={record} onSave={values => moderate(record, values)} />
                  )}
                </div>
              );
            })()}
        </div>
      )}
      {tab === "results" && <ResultsView config={config} />}
      {tab === "design" && canEdit && <DesignView config={config} onSave={persistDesign} />}
    </section>
  );
}
