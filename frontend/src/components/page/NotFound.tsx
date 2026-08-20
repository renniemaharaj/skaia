import { AlertCircle, Home } from "lucide-react";
import { Link } from "react-router-dom";
import { ContentFlatCard } from "../cards/ContentFlatCard";
import { FormSectionIntro } from "../form";
import "../auth/Auth.css";

export const NotFound: React.FC = () => {
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
              <Home size={20} />
              Return to Home
            </Link>
          </div>
        </ContentFlatCard>
      </div>
    </div>
  );
};
