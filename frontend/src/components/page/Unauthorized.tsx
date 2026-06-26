import { useAtomValue } from "jotai";
import { Home, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { isAuthenticatedAtom } from "../../atoms/auth";
import { ContentFlatCard } from "../cards/ContentFlatCard";
import "../auth/Auth.css";

export const Unauthorized: React.FC = () => {
  const navigate = useNavigate();
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);

  return (
    <div className="auth-page">
      <div className="auth-container">
        <ContentFlatCard className="auth-card auth-card--challenge">
          <div className="section__header">
            <Lock size={24} className="section__header-icon" aria-hidden="true" />
            <span className="section__header-eyebrow">
              {isAuthenticated ? "Permission required" : "Sign-in required"}
            </span>
            <h1>Access Denied</h1>
            <p>
              {isAuthenticated
                ? "You don't have permission to view this page."
                : "You need to sign in to access this page."}
            </p>
          </div>

          <div className="section__content ui-actions ui-actions--center">
            <button onClick={() => navigate("/")} className="btn btn-primary">
              <Home size={20} />
              Go Home
            </button>
          </div>
        </ContentFlatCard>
      </div>
    </div>
  );
};
