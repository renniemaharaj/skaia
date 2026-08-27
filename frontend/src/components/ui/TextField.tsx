import "./TextField.css";
import { forwardRef, useId } from "react";
import type * as React from "react";

interface FieldPresentationProps {
  label?: React.ReactNode;
  help?: React.ReactNode;
  error?: React.ReactNode;
  block?: boolean;
}

export interface TextFieldProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    FieldPresentationProps {}

export interface TextAreaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    FieldPresentationProps {}

const describedBy = (id: string, help: React.ReactNode, error: React.ReactNode) =>
  [help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, help, error, block = true, className, id, ...props }, ref) => {
    const generatedId = useId();
    const controlId = id ?? generatedId;
    return (
      <div
        className={`ui-field${block ? " ui-field--block" : ""}${error ? " ui-field--error" : ""}`}
      >
        {label && (
          <label className="ui-field__label" htmlFor={controlId}>
            {label}
          </label>
        )}
        <input
          {...props}
          ref={ref}
          id={controlId}
          className={`ui-field__control${className ? ` ${className}` : ""}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(controlId, help, error)}
        />
        {help && (
          <span id={`${controlId}-help`} className="ui-field__help">
            {help}
          </span>
        )}
        {error && (
          <span id={`${controlId}-error`} className="ui-field__error">
            {error}
          </span>
        )}
      </div>
    );
  }
);

TextField.displayName = "TextField";

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  ({ label, help, error, block = true, className, id, ...props }, ref) => {
    const generatedId = useId();
    const controlId = id ?? generatedId;
    return (
      <div
        className={`ui-field${block ? " ui-field--block" : ""}${error ? " ui-field--error" : ""}`}
      >
        {label && (
          <label className="ui-field__label" htmlFor={controlId}>
            {label}
          </label>
        )}
        <textarea
          {...props}
          ref={ref}
          id={controlId}
          className={`ui-field__control${className ? ` ${className}` : ""}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(controlId, help, error)}
        />
        {help && (
          <span id={`${controlId}-help`} className="ui-field__help">
            {help}
          </span>
        )}
        {error && (
          <span id={`${controlId}-error`} className="ui-field__error">
            {error}
          </span>
        )}
      </div>
    );
  }
);

TextArea.displayName = "TextArea";
