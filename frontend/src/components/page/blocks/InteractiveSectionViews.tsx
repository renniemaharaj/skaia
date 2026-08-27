import { Field, FieldArray, Form, Formik, useField } from "formik";
import { Plus, Trash2 } from "lucide-react";
import { FormSelect } from "../../form";
import Button from "../../ui/Button";
import StarRating from "../../ui/StarRating";
import {
  INTERACTIVE_FIELD_TYPES,
  type InteractiveConfig,
  type InteractiveField,
  type InteractiveFieldType,
  type InteractiveRecord,
  interactiveResultEntries,
} from "../interactiveTypes";

const choiceField = (type: InteractiveFieldType) =>
  type === "radio" || type === "select" || type === "multi_select";

export const displayValue = (value: unknown) => {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value == null || value === "" ? "-" : String(value);
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

export function FieldControl({
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
        <FormSelect
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

export function RecordDetail({
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

export function QAAnswerForm({
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
          <FormSelect
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

export function DesignView({
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
            <FormSelect
              name="status"
              size="sm"
              options={[
                { value: "open", label: "Open" },
                { value: "closed", label: "Closed" },
              ]}
            />
            <FormSelect
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
                    <FormSelect
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
