import type { ReactNode } from "react";

export default function FormSectionIntro({
  icon,
  eyebrow,
  title,
  description,
  className = "",
}: {
  icon?: ReactNode;
  eyebrow?: string;
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div
      className={`managed-form__section-intro${className ? ` ${className}` : ""}`}
    >
      {icon && <span className="managed-form__section-intro-icon">{icon}</span>}
      <div>
        {eyebrow && <span className="managed-form__section-intro-eyebrow">{eyebrow}</span>}
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}
