import { useField } from "formik";
import {
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
  useId,
} from "react";
import { ContentStandOutCard } from "../cards/ContentStandOutCard";
import "./FormField.css";

interface SharedFieldProps {
  name: string;
  label: string;
  help?: string;
  icon?: ReactNode;
  variant?: "default" | "grouped";
}

type FormFieldProps = SharedFieldProps &
  (
    | ({ as?: "input" } & Omit<InputHTMLAttributes<HTMLInputElement>, "name">)
    | ({ as: "textarea" } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "name">)
  );

/** Formik-bound text field with one normalized label/help/error layout. */
export default function FormField({
  name,
  label,
  help,
  icon,
  variant = "default",
  ...props
}: FormFieldProps) {
  const generatedId = useId();
  const [field, meta] = useField(name);
  const id = props.id ?? `field-${generatedId}`;
  const { as, ...controlProps } = props;
  const error = meta.touched ? meta.error : undefined;
  const describedBy = [help ? `${id}-help` : "", error ? `${id}-error` : ""]
    .filter(Boolean)
    .join(" ");

  const content = (
    <div className={`managed-field${error ? " managed-field--error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {help && (
        <p className="form-help" id={`${id}-help`}>
          {help}
        </p>
      )}
      {as === "textarea" ? (
        <textarea
          {...field}
          {...(controlProps as TextareaHTMLAttributes<HTMLTextAreaElement>)}
          id={id}
          aria-describedby={describedBy || undefined}
          aria-invalid={Boolean(error) || undefined}
        />
      ) : icon ? (
        <div className="managed-field__input-wrapper">
          <span className="managed-field__icon" aria-hidden="true">
            {icon}
          </span>
          <input
            {...field}
            {...(controlProps as InputHTMLAttributes<HTMLInputElement>)}
            id={id}
            aria-describedby={describedBy || undefined}
            aria-invalid={Boolean(error) || undefined}
          />
        </div>
      ) : (
        <input
          {...field}
          {...(controlProps as InputHTMLAttributes<HTMLInputElement>)}
          id={id}
          aria-describedby={describedBy || undefined}
          aria-invalid={Boolean(error) || undefined}
        />
      )}
      {error && (
        <p className="managed-field__error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );

  return variant === "grouped" ? (
    <ContentStandOutCard className="managed-field-group" emphasis="group">
      {content}
    </ContentStandOutCard>
  ) : (
    content
  );
}
