import { useField } from "formik";
import { type InputHTMLAttributes, type TextareaHTMLAttributes, useId } from "react";
import "./FormField.css";

interface SharedFieldProps {
  name: string;
  label: string;
  help?: string;
}

type FormFieldProps = SharedFieldProps &
  (
    | ({ as?: "input" } & Omit<InputHTMLAttributes<HTMLInputElement>, "name">)
    | ({ as: "textarea" } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "name">)
  );

/** Formik-bound text field with one normalized label/help/error layout. */
export default function FormField({ name, label, help, ...props }: FormFieldProps) {
  const generatedId = useId();
  const [field, meta] = useField(name);
  const id = props.id ?? `field-${generatedId}`;
  const { as, ...controlProps } = props;
  const error = meta.touched ? meta.error : undefined;
  const describedBy = [help ? `${id}-help` : "", error ? `${id}-error` : ""]
    .filter(Boolean)
    .join(" ");

  return (
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
}
