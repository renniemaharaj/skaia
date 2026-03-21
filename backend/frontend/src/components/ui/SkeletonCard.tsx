import "./SkeletonCard.css";

type SkeletonVariant = "default" | "forumCategory";

export const SkeletonCard: React.FC<{
  count?: number;
  variant?: SkeletonVariant;
}> = ({ count = 1, variant = "default" }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-card-wrapper">
          <div
            className={`skeleton skeleton-card ${
              variant === "forumCategory" ? "skeleton-card-forum" : ""
            }`}
          >
            {variant === "forumCategory" ? (
              <>
                <div className="skeleton-card-forum-header">
                  <div
                    className="skeleton skeleton-heading"
                    style={{ width: "50%", marginBottom: 0 }}
                  />
                  <div className="skeleton-card-forum-actions">
                    <div
                      className="skeleton skeleton-pill"
                      style={{ width: "40px", height: "18px" }}
                    />
                    <div
                      className="skeleton skeleton-circle"
                      style={{ width: "18px", height: "18px" }}
                    />
                  </div>
                </div>
                <div
                  className="skeleton skeleton-text"
                  style={{ width: "95%", marginBottom: "12px" }}
                />
                <div className="skeleton-card-forum-threads">
                  <div
                    className="skeleton skeleton-text"
                    style={{ width: "95%", height: "14px" }}
                  />
                  <div
                    className="skeleton skeleton-text"
                    style={{ width: "75%", height: "14px" }}
                  />
                </div>
              </>
            ) : (
              <>
                <div
                  className="skeleton skeleton-heading"
                  style={{ width: "70%" }}
                />
                <div
                  className="skeleton skeleton-text"
                  style={{ width: "100%" }}
                />
                <div
                  className="skeleton skeleton-text"
                  style={{ width: "90%" }}
                />
                <div
                  className="skeleton skeleton-text"
                  style={{ width: "60%", marginBottom: "16px" }}
                />
              </>
            )}
          </div>
        </div>
      ))}
    </>
  );
};
