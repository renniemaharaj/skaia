import { Plus } from "lucide-react";
import { useState } from "react";
import type { NavigateFunction } from "react-router-dom";

interface ForumActionCardProps {
  canCreateCategory: boolean;
  navigate: NavigateFunction;
}

export function ForumActionCard({ canCreateCategory, navigate }: ForumActionCardProps) {
  const [hoveredSection, setHoveredSection] = useState<"discussion" | "category" | null>(null);

  return (
    <div className="card card--interactive new-thread-card feature-card">
      <div className="new-thread-content">
        <div style={{ display: "flex", gap: "12px", width: "100%" }}>
          <button
            type="button"
            onClick={() => navigate("/new-thread")}
            onMouseEnter={() => setHoveredSection("discussion")}
            onMouseLeave={() => setHoveredSection(null)}
            style={{
              flex: 1,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
              transition: "transform 0.2s ease, color 0.2s ease",
              transform: hoveredSection === "discussion" ? "scale(1.05)" : "scale(1)",
              color: hoveredSection === "discussion" ? "var(--primary-color)" : "inherit",
              border: 0,
              background: "transparent",
              font: "inherit",
            }}
          >
            <div className="feature-icon">
              <Plus size={48} className="new-thread-icon" />
            </div>
            <h3>Start a Discussion</h3>
            <p>Share your thoughts with the community</p>
          </button>

          {canCreateCategory && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                navigate("/forum/new-category");
              }}
              onMouseEnter={() => setHoveredSection("category")}
              onMouseLeave={() => setHoveredSection(null)}
              style={{
                flex: 0,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "8px",
                justifyContent: "center",
                padding: "0 16px",
                borderWidth: "0 0 0 1px",
                borderStyle: "solid",
                borderColor: "var(--border-color)",
                transition: "background-color 0.2s ease, opacity 0.2s ease",
                color: "inherit",
                font: "inherit",
                backgroundColor:
                  hoveredSection === "category"
                    ? "var(--surface-hover-color, rgba(255,255,255,0.05))"
                    : "transparent",
              }}
              title="Create Category"
            >
              <Plus
                size={32}
                className="new-thread-icon"
                style={{
                  opacity: hoveredSection === "category" ? 1 : 0.6,
                  transition: "opacity 0.2s ease, transform 0.2s ease",
                  transform: hoveredSection === "category" ? "rotate(180deg)" : "rotate(0deg)",
                }}
              />
              <span
                style={{
                  fontSize: "0.7rem",
                  opacity: hoveredSection === "category" ? 1 : 0.6,
                  transition: "opacity 0.2s ease",
                }}
              >
                New Category
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
