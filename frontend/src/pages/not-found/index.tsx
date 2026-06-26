import { AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { ContentFlatCard } from "../../components/cards/ContentFlatCard";
import "../../components/auth/Auth.css";

export const NotFoundPage = () => {
  return (
    <div className="auth-page">
      <div className="auth-container">
        <ContentFlatCard className="auth-card auth-card--challenge">
          <div className="section__header">
            <AlertCircle size={24} className="section__header-icon" aria-hidden="true" />
            <span className="section__header-eyebrow">404</span>
            <h1>Page Not Found</h1>
            <p>The route you're trying to access doesn't exist or has been moved.</p>
          </div>
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
