import type { ReactNode } from "react";
import "./ManagedForm.css";

export default function FormSectionIntro({
  icon,
  eyebrow,
  title,
  description,
  headingLevel = 3,
  className = "",
}: {
  icon?: ReactNode;
  eyebrow?: string;
  title: string;
  description: ReactNode;
  headingLevel?: 1 | 2 | 3;
  className?: string;
}) {
  const Heading = ({ 1: "h1", 2: "h2", 3: "h3" } as const)[headingLevel];

  return (
    <div
      className={`managed-form__section-intro${className ? ` ${className}` : ""}`}
    >
      {icon && <span className="managed-form__section-intro-icon">{icon}</span>}
      <div>
        {eyebrow && <span className="managed-form__section-intro-eyebrow">{eyebrow}</span>}
        <Heading>{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}
