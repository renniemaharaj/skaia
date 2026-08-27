import { useField } from "formik";
import Checkbox, { type CheckboxProps } from "../ui/Checkbox";

interface FormCheckboxProps extends Omit<CheckboxProps, "name" | "checked" | "onChange"> {
  name: string;
}

/** Formik binding for the shared Checkbox primitive. */
export default function FormCheckbox({ name, ...props }: FormCheckboxProps) {
  const [field, meta, helpers] = useField({ name, type: "checkbox" });

  return (
    <div>
      <Checkbox
        {...props}
        name={name}
        checked={field.checked}
        onBlur={() => helpers.setTouched(true)}
        onChange={event => helpers.setValue(event.target.checked)}
      />
      {meta.touched && meta.error && <p className="managed-field__error">{meta.error}</p>}
    </div>
  );
}
