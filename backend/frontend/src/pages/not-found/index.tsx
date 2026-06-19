import { AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { ContentStandOutCard } from "../../components/cards/ContentStandOutCard";
import "../../styles/NotFound.css";

export const NotFoundPage = () => {
  return (
    <div className="not-found-container">
      <ContentStandOutCard className="not-found-content">
        <div className="not-found-icon">
          <AlertCircle size={80} />
        </div>
        <h1>404</h1>
        <h2>Page Not Found</h2>
        <p>Sorry, we couldn't find the page you're looking for.</p>
        <p className="secondary-text">
          The route you're trying to access doesn't exist. Let's get you back on track!
        </p>
        <Link to="/" className="btn btn-primary btn-lg">
          Return to Home
        </Link>
      </ContentStandOutCard>
    </div>
  );
};
