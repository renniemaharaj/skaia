import { Form, Formik, type FormikHelpers } from "formik";
import { useAtomValue } from "jotai";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { currentUserAtom, isAuthenticatedAtom } from "../../../atoms/auth";
import { apiRequest } from "../../../utils/api";
import Button from "../../ui/Button";
import { customConfirm } from "../../ui/Prompt";
import { type TableColumn, TableView } from "../../ui/TableView/TableView";
import { EditableText } from "../EditControls";
import { usePageBuilderContext } from "../PageBuilderContext";
import {
  type InteractiveConfig,
  type InteractiveRecord,
  type InteractiveSectionType,
  initialInteractiveValues,
  interactiveResponseLimitReached,
  normalizeInteractiveAnswers,
  parseInteractiveConfig,
  validateInteractiveValues,
} from "../interactiveTypes";
import type { PageSection } from "../types";
import {
  DesignView,
  displayValue,
  FieldControl,
  QAAnswerForm,
  RecordDetail,
  ResultsView,
} from "./InteractiveSectionViews";
import "./InteractiveSectionBlock.css";

export interface InteractiveSubmissionBinding {
  mode?: "append" | "replace";
  initialAnswers?: Record<string, unknown>;
  submit: (
    answers: Record<string, unknown>,
    idempotencyKey: string
  ) => Promise<{ config?: string } | void>;
}

interface Props {
  section: PageSection;
  canEdit: boolean;
  onUpdate: (section: PageSection) => void;
  onDelete: (id: number) => void;
  submission?: InteractiveSubmissionBinding;
  presentation?: "section" | "action";
}

type Tab = "preview" | "responses" | "results" | "design";

export function InteractiveSectionBlock({
  section,
  canEdit,
  onUpdate,
  submission,
  presentation = "section",
}: Props) {
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

  const ownRecords = useMemo(
    () => config.records.filter(record => String(record.user_id) === String(currentUser?.id)),
    [config.records, currentUser?.id]
  );
  const alreadyParticipated = ownRecords.length > 0;
  const participationLocked =
    config.status === "closed" ||
    (submission?.mode !== "replace" &&
      interactiveResponseLimitReached(type, config.response_limit, ownRecords.length));
  const initialValues = useMemo(
    () => ({
      ...initialInteractiveValues(config.fields),
      ...(submission?.initialAnswers ??
        (submission?.mode === "replace" ? ownRecords.at(-1)?.answers : undefined)),
    }),
    [config.fields, ownRecords, submission?.initialAnswers, submission?.mode]
  );

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
    if ((!pageId && !submission) || !isAuthenticated) {
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
      const response = submission
        ? await submission.submit(answers, submissionRef.current.key)
        : await apiRequest<{ config: string }>(
            `/pages/${pageId}/sections/${section.id}/responses`,
            {
              method: "POST",
              body: JSON.stringify({ answers, idempotency_key: submissionRef.current.key }),
            }
          );
      if (response?.config) replaceRuntimeConfig(response.config);
      submissionRef.current = null;
      if (!submission || submission.mode === "append") helpers.resetForm();
      toast.success(config.success_text);
      if ((type === "poll" || type === "vote") && config.result_summary) setTab("results");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit response");
    } finally {
      helpers.setSubmitting(false);
    }
  };

  const deleteRecord = async (record: InteractiveRecord) => {
    if (
      !pageId ||
      !(await customConfirm({
        title: "Delete this submitted response?",
        body: "The response will move to Trash and can be restored while its page section remains active.",
        confirmLabel: "Delete response",
        destructive: true,
      }))
    )
      return;
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
    <section className={`interactive-section interactive-section--${presentation}`}>
      <header className="interactive-heading">
        {(canEdit || section.heading || section.subheading) && (
          <div>
            {canEdit && <span>{type === "qa" ? "Questions & answers" : type}</span>}
            {canEdit ? (
              <EditableText
                value={section.heading}
                onSave={heading => onUpdate({ ...section, heading })}
                tag="h2"
              />
            ) : (
              section.heading && <h2>{section.heading}</h2>
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
        )}
        {presentation === "section" && (
          <span className={`interactive-open-state interactive-open-state--${config.status}`}>
            {config.status}
          </span>
        )}
      </header>
      {(presentation === "section" || tabs.length > 1) && (
        <div
          className="interactive-tabs"
          role="tablist"
          aria-label={section.heading ? `${section.heading} views` : "Section views"}
        >
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
      )}

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
              initialValues={initialValues}
              enableReinitialize
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
                  {type === "vote" && submission?.mode !== "replace" && (
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
