import { useAtomValue } from "jotai";
import { hasPermissionAtom } from "../../atoms/auth";
import { useLandingData } from "../../hooks/useLandingData";
import { BlockRenderer } from "../landing/BlockRenderer";
import { LandingSkeleton } from "../landing/LandingSkeleton";
import "./Landing.css";
import "../ui/FeatureCard.css";

export const Landing: React.FC = () => {
  const hasPermission = useAtomValue(hasPermissionAtom);
  const canEdit = hasPermission("home.manage");

  const {
    sections,
    loading,
    error,
    updateSection,
    createSection,
    deleteSection,
    createItem,
    updateItem,
    deleteItem,
  } = useLandingData();

  if (loading) {
    return (
      <div className="landing-container">
        <LandingSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="landing-container">
        <div style={{ textAlign: "center", padding: "4rem 1rem" }}>
          <p style={{ color: "var(--color-danger, #e74c3c)" }}>
            Failed to load landing page: {error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="landing-container">
      <BlockRenderer
        sections={sections}
        canEdit={canEdit}
        onUpdateSection={updateSection}
        onDeleteSection={deleteSection}
        onCreateSection={createSection}
        onCreateItem={createItem}
        onUpdateItem={updateItem}
        onDeleteItem={deleteItem}
      />
    </div>
  );
};
