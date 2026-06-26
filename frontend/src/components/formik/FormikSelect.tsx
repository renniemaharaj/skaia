import { useField } from "formik";
import type React from "react";
import Select, { type SelectProps } from "../input/Select";

export interface FormikSelectProps extends Omit<SelectProps, "name" | "value" | "onChange"> {
  name: string;
}

export const FormikSelect: React.FC<FormikSelectProps> = ({ name, ...props }) => {
  const [field, meta, helpers] = useField(name);

  return (
    <div className="sk-formik-select-wrapper">
      <Select
        id={name}
        value={field.value}
        onChange={e => helpers.setValue(e.target.value)}
        onBlur={() => helpers.setTouched(true)}
        error={meta.touched && meta.error ? meta.error : undefined}
        {...props}
      />
    </div>
  );
};

export default FormikSelect;
