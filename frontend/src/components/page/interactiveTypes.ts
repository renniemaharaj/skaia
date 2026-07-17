import type { SectionType } from "./types";

export type InteractiveSectionType = Extract<
  SectionType,
  "form" | "qa" | "survey" | "poll" | "vote"
>;
export type InteractiveFieldType =
  | "text"
  | "textarea"
  | "email"
  | "phone"
  | "url"
  | "number"
  | "date"
  | "time"
  | "select"
  | "multi_select"
  | "radio"
  | "checkbox"
  | "consent"
  | "rating"
  | "scale"
  | "nps";

export interface InteractiveOption {
  key: string;
  label: string;
}

export interface InteractiveField {
  key: string;
  type: InteractiveFieldType;
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  options?: InteractiveOption[];
  min?: number;
  max?: number;
}

export interface InteractiveRecord {
  id: string;
  user_id?: number;
  respondent_name?: string;
  answers: Record<string, unknown>;
  status: "submitted" | "pending" | "published" | "answered" | "archived";
  answer?: string;
  pinned?: boolean;
  submitted_at: string;
  updated_at?: string;
}

export interface InteractiveResultSummary {
  total: number;
  counts: Record<string, Record<string, number>>;
}

export interface InteractiveConfig extends Record<string, unknown> {
  status: "open" | "closed";
  submit_label: string;
  success_text: string;
  result_visibility: "never" | "after_participation" | "always";
  response_limit: number;
  moderation?: boolean;
  fields: InteractiveField[];
  records: InteractiveRecord[];
  result_summary?: InteractiveResultSummary;
}

const option = (key: string, label: string): InteractiveOption => ({ key, label });

export const INTERACTIVE_FIELD_TYPES: { value: InteractiveFieldType; label: string }[] = [
  { value: "text", label: "Short text" },
  { value: "textarea", label: "Long text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "url", label: "URL" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "time", label: "Time" },
  { value: "select", label: "Select" },
  { value: "multi_select", label: "Multiple choices" },
  { value: "radio", label: "Radio choices" },
  { value: "checkbox", label: "Checkbox" },
  { value: "consent", label: "Consent" },
  { value: "rating", label: "Rating" },
  { value: "scale", label: "Scale" },
  { value: "nps", label: "NPS" },
];

export function defaultInteractiveConfig(type: InteractiveSectionType): InteractiveConfig {
  const shared = {
    status: "open" as const,
    success_text: "Thank you. Your response has been recorded.",
    result_visibility: "never" as const,
    response_limit: 0,
    records: [],
  };
  if (type === "qa") {
    return {
      ...shared,
      submit_label: "Ask question",
      moderation: true,
      fields: [{ key: "question", type: "textarea", label: "Your question", required: true }],
    };
  }
  if (type === "survey") {
    return {
      ...shared,
      submit_label: "Complete survey",
      result_visibility: "after_participation",
      response_limit: 1,
      fields: [
        {
          key: "satisfaction",
          type: "scale",
          label: "How satisfied are you?",
          required: true,
          min: 1,
          max: 5,
        },
        { key: "feedback", type: "textarea", label: "Tell us more", required: false },
      ],
    };
  }
  if (type === "poll") {
    return {
      ...shared,
      submit_label: "Submit vote",
      result_visibility: "after_participation",
      response_limit: 1,
      fields: [
        {
          key: "choice",
          type: "radio",
          label: "Choose one",
          required: true,
          options: [option("option-1", "Option one"), option("option-2", "Option two")],
        },
      ],
    };
  }
  if (type === "vote") {
    return {
      ...shared,
      submit_label: "Confirm ballot",
      result_visibility: "after_participation",
      response_limit: 1,
      fields: [
        {
          key: "candidate",
          type: "radio",
          label: "Select a candidate",
          required: true,
          options: [option("candidate-1", "Candidate one"), option("candidate-2", "Candidate two")],
        },
      ],
    };
  }
  return {
    ...shared,
    submit_label: "Submit form",
    fields: [
      { key: "name", type: "text", label: "Full name", required: true },
      { key: "email", type: "email", label: "Email", required: true },
      { key: "message", type: "textarea", label: "Message", required: true },
    ],
  };
}

export function parseInteractiveConfig(
  raw: string,
  type: InteractiveSectionType
): InteractiveConfig {
  let parsed: Partial<InteractiveConfig> = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = {};
  }
  const defaults = defaultInteractiveConfig(type);
  return {
    ...defaults,
    ...parsed,
    fields: Array.isArray(parsed.fields) ? parsed.fields : defaults.fields,
    records: Array.isArray(parsed.records) ? parsed.records : [],
  };
}

export function clearInteractiveRecords(raw: string): string {
  try {
    const parsed = JSON.parse(raw || "{}");
    return JSON.stringify({ ...parsed, records: [], result_summary: undefined });
  } catch {
    return raw;
  }
}

export function initialInteractiveValues(fields: InteractiveField[]): Record<string, unknown> {
  return Object.fromEntries(
    fields.map(field => [
      field.key,
      field.type === "checkbox" || field.type === "consent"
        ? false
        : field.type === "multi_select"
          ? []
          : "",
    ])
  );
}

export function validateInteractiveValues(
  fields: InteractiveField[],
  values: Record<string, unknown>
) {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const value = values[field.key];
    const empty =
      value === "" ||
      value == null ||
      (Array.isArray(value) && value.length === 0) ||
      value === false;
    if (field.required && empty) errors[field.key] = `${field.label} is required`;
    if (
      field.type === "email" &&
      typeof value === "string" &&
      value &&
      !/^\S+@\S+\.\S+$/.test(value)
    ) {
      errors[field.key] = "Enter a valid email address";
    }
    if (field.type === "url" && typeof value === "string" && value) {
      try {
        new URL(value);
      } catch {
        errors[field.key] = "Enter a valid URL";
      }
    }
  }
  return errors;
}
