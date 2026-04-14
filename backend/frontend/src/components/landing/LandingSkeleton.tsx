/**  Skeleton placeholder shown while landing page data is loading. */
export const LandingSkeleton = () => (
  <>
    {/* Hero skeleton */}
    <div className="skeleton-pb-hero">
      <div
        className="skeleton skeleton-bar"
        style={{ width: "40%", height: 36 }}
      />
      <div
        className="skeleton skeleton-bar"
        style={{ width: "55%", height: 18, marginTop: 12 }}
      />
    </div>

    {/* Card group skeleton */}
    <div className="skeleton-pb-section">
      <div
        className="skeleton skeleton-bar"
        style={{ width: "35%", height: 24, margin: "0 auto" }}
      />
      <div
        className="skeleton skeleton-bar"
        style={{ width: "50%", height: 14, margin: "8px auto 0" }}
      />
      <div className="skeleton-pb-cards">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton-pb-card">
            <div
              className="skeleton skeleton-bar"
              style={{ width: "60%", height: 18 }}
            />
            <div
              className="skeleton skeleton-bar"
              style={{ width: "90%", height: 12, marginTop: 8 }}
            />
            <div
              className="skeleton skeleton-bar"
              style={{ width: "80%", height: 12, marginTop: 4 }}
            />
          </div>
        ))}
      </div>
    </div>

    {/* Stats skeleton */}
    <div className="skeleton-pb-section">
      <div className="skeleton-pb-cards">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="skeleton-pb-stat">
            <div className="skeleton skeleton-circle" />
            <div style={{ flex: 1 }}>
              <div
                className="skeleton skeleton-bar"
                style={{ width: "50%", height: 14 }}
              />
              <div
                className="skeleton skeleton-bar"
                style={{ width: "70%", height: 12, marginTop: 6 }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Gallery skeleton */}
    <div className="skeleton-pb-section">
      <div
        className="skeleton skeleton-bar"
        style={{ width: "30%", height: 24, margin: "0 auto" }}
      />
      <div className="skeleton-pb-gallery">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton skeleton-gallery-item" />
        ))}
      </div>
    </div>

    {/* Features skeleton */}
    <div className="skeleton-pb-section">
      <div
        className="skeleton skeleton-bar"
        style={{ width: "40%", height: 24, margin: "0 auto" }}
      />
      <div className="skeleton-pb-features">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="skeleton-pb-feature">
            <div className="skeleton skeleton-circle-sm" />
            <div
              className="skeleton skeleton-bar"
              style={{ width: "60%", height: 14, marginTop: 8 }}
            />
            <div
              className="skeleton skeleton-bar"
              style={{ width: "80%", height: 10, marginTop: 4 }}
            />
          </div>
        ))}
      </div>
    </div>
  </>
);
