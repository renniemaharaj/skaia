import { useField } from "formik";
import Select, { type SelectProps } from "../ui/Select";

interface FormSelectProps extends Omit<SelectProps, "name" | "value" | "onChange" | "error"> {
  name: string;
  onValueChange?: (value: string) => void;
  parseValue?: (value: string) => unknown;
}

/** Formik binding for the shared Select primitive. */
export default function FormSelect({ name, onValueChange, parseValue, ...props }: FormSelectProps) {
  const [field, meta, helpers] = useField(name);

  return (
    <Select
      {...props}
      name={name}
      value={field.value}
      onBlur={() => helpers.setTouched(true)}
      onChange={event => {
        void helpers.setValue(parseValue ? parseValue(event.target.value) : event.target.value);
        onValueChange?.(event.target.value);
      }}
      error={meta.touched && meta.error ? meta.error : undefined}
    />
  );
}
