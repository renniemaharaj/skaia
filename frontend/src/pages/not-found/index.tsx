import { AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { ContentFlatCard } from "../../components/cards/ContentFlatCard";
import { FormSectionIntro } from "../../components/form";
import "../../components/auth/Auth.css";

export const NotFoundPage = () => {
  return (
    <div className="auth-page">
      <div className="auth-container">
        <ContentFlatCard className="auth-card auth-card--challenge">
          <FormSectionIntro
            className="managed-form__section-intro--spaced"
            icon={<AlertCircle size={20} aria-hidden="true" />}
            eyebrow="404"
            title="Page Not Found"
            description="The route you're trying to access doesn't exist or has been moved."
            headingLevel={1}
          />
          <div className="section__content ui-actions ui-actions--center">
            <Link to="/" className="btn btn-primary">
              Return to Home
            </Link>
          </div>
        </ContentFlatCard>
      </div>
    </div>
  );
};
