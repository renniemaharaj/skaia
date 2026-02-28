import "./FormGroup.css";

interface FormGroupProps {
  label?: string;
  id?: string;
  type?: "text" | "email" | "password" | "number" | "textarea";
  placeholder?: string;
  value: string;
  onChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  className?: string;
}

export const FormGroup: React.FC<FormGroupProps> = ({
  label,
  id,
  type = "text",
  placeholder,
  value,
  onChange,
  disabled = false,
  required = false,
  error,
  className = "",
}) => {
  return (
    <div className={`form-group ${className}`}>
      {label && <label htmlFor={id}>{label}</label>}
      {type === "textarea" ? (
        <textarea
          id={id}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={disabled}
          required={required}
        />
      ) : (
        <input
          id={id}
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={disabled}
          required={required}
        />
      )}
      {error && <span className="form-error">{error}</span>}
    </div>
  );
};
