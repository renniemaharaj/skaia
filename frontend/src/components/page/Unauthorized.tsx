import { useAtomValue } from "jotai";
import { Home, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { isAuthenticatedAtom } from "../../atoms/auth";
import { ContentFlatCard } from "../cards/ContentFlatCard";
import { FormSectionIntro } from "../form";
import "../auth/Auth.css";

export const Unauthorized: React.FC = () => {
  const navigate = useNavigate();
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);

  return (
    <div className="auth-page">
      <div className="auth-container">
        <ContentFlatCard className="auth-card auth-card--challenge">
          <FormSectionIntro
            className="managed-form__section-intro--spaced"
            icon={<Lock size={20} aria-hidden="true" />}
            eyebrow={isAuthenticated ? "Permission required" : "Sign-in required"}
            title="Access Denied"
            description={
              isAuthenticated
                ? "You don't have permission to view this page."
                : "You need to sign in to access this page."
            }
            headingLevel={1}
          />

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
