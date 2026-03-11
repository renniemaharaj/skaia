import { useNavigate } from "react-router-dom";
import { Lock, Home } from "lucide-react";
import { useAtomValue } from "jotai";
import { isAuthenticatedAtom } from "../atoms/auth";
import "../styles/NotFound.css";

export const Unauthorized: React.FC = () => {
  const navigate = useNavigate();
  const isAuthenticated = useAtomValue(isAuthenticatedAtom);

  return (
    <div className="not-found-page">
      <div className="not-found-container">
        <div className="not-found-content">
          <div className="not-found-icon">
            <Lock size={80} />
          </div>

          <h1 className="not-found-title">Access Denied</h1>
          <p className="not-found-description">
            {isAuthenticated
              ? "You don't have permission to view this page."
              : "You need to sign in to access this page."}
          </p>

          <div className="not-found-actions">
            <button onClick={() => navigate("/")} className="btn btn-primary">
              <Home size={20} />
              Go Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
