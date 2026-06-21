import { useField } from "formik";
import React from "react";
import "./Formik.css";

// Formik bindings for standard inputs.
// Note: your existing Input.tsx is heavily specialized for chat messages.
// This implements a standard Formik input that matches your select/checkbox philosophy.

export interface FormikInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  name: string;
  label?: string;
}

export const FormikInput: React.FC<FormikInputProps> = ({ name, label, className, ...props }) => {
  const [field, meta] = useField(name);
  const isError = meta.touched && meta.error;

  const wrapperClasses = [
    "sk-form-input",
    isError && "sk-form-input--error",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={wrapperClasses}>
      {label && (
        <label className="sk-form-input__label" htmlFor={name}>
          {label}
        </label>
      )}
      <input
        id={name}
        className="sk-form-input__native"
        aria-invalid={!!isError}
        {...field}
        {...props}
      />
      {isError && <p className="sk-form-input__error">{meta.error}</p>}
    </div>
  );
};

export default FormikInput;
