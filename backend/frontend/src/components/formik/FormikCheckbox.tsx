import { useField } from "formik";
import React from "react";
import Checkbox, { type CheckboxProps } from "../input/Checkbox";

export interface FormikCheckboxProps extends Omit<CheckboxProps, "name" | "checked" | "onChange"> {
  name: string;
}

export const FormikCheckbox: React.FC<FormikCheckboxProps> = ({ name, ...props }) => {
  const [field, meta, helpers] = useField({ name, type: "checkbox" });

  return (
    <div className="sk-formik-checkbox-wrapper">
      <Checkbox
        id={name}
        checked={field.checked}
        onChange={(e) => helpers.setValue(e.target.checked)}
        onBlur={() => helpers.setTouched(true)}
        {...props}
      />
      {meta.touched && meta.error && (
        <p className="sk-form-input__error" style={{ marginTop: "0.25rem" }}>
          {meta.error}
        </p>
      )}
    </div>
  );
};

export default FormikCheckbox;
