import "./SkeletonCard.css";

export const SkeletonCard: React.FC<{ count?: number }> = ({ count = 1 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-card-wrapper">
          <div className="skeleton skeleton-card">
            <div
              className="skeleton skeleton-heading"
              style={{ width: "70%" }}
            />
            <div className="skeleton skeleton-text" style={{ width: "100%" }} />
            <div className="skeleton skeleton-text" style={{ width: "90%" }} />
            <div
              className="skeleton skeleton-text"
              style={{ width: "60%", marginBottom: "16px" }}
            />
          </div>
        </div>
      ))}
    </>
  );
};
