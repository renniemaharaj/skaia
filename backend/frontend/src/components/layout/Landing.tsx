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

  const moveSection = async (
    sourceSectionId: number,
    targetSectionId: number,
  ) => {
    const sorted = [...sections].sort(
      (a, b) => a.display_order - b.display_order,
    );
    const sourceIdx = sorted.findIndex((sec) => sec.id === sourceSectionId);
    const targetIdx = sorted.findIndex((sec) => sec.id === targetSectionId);
    if (sourceIdx === -1 || targetIdx === -1 || sourceIdx === targetIdx) return;

    const next = [...sorted];
    const [moving] = next.splice(sourceIdx, 1);
    next.splice(targetIdx, 0, moving);

    const normalized = next.map((section, idx) => ({
      ...section,
      display_order: idx + 1,
    }));

    await Promise.all(
      normalized.map((section) =>
        section.display_order !==
        sections.find((s) => s.id === section.id)?.display_order
          ? updateSection(section)
          : Promise.resolve(),
      ),
    );
  };

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
        onMoveSection={moveSection}
      />
    </div>
  );
};
