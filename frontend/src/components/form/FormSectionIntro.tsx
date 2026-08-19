import type { ReactNode } from "react";

export default function FormSectionIntro({
  icon,
  title,
  description,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="managed-form__section-intro">
      {icon && <span className="managed-form__section-intro-icon">{icon}</span>}
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </div>
  );
}
