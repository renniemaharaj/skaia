import { useEffect, useState } from "react";
import { apiRequest } from "../../utils/api";

export function ActiveJobsBadge() {
  const [metrics, setMetrics] = useState<{ active_jobs: number; cache_hits_1h: number; new_scrapes_1h: number } | null>(null);

  useEffect(() => {
    let mounted = true;
    
    // Initial fetch to get the current state
    const fetchJobs = async () => {
      try {
        const res = await apiRequest<{ active_jobs: number; cache_hits_1h: number; new_scrapes_1h: number }>("/mediascraper/jobs");
        if (mounted && res && typeof res.active_jobs === "number") {
          setMetrics(res);
        }
      } catch (err) {
        // silently ignore
      }
    };

    fetchJobs();

    // Listen for WebSocket updates
    const handleJobsUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ active_jobs: number; cache_hits_1h: number; new_scrapes_1h: number }>;
      if (mounted) {
        setMetrics(customEvent.detail);
      }
    };

    window.addEventListener("mediascraper:jobs", handleJobsUpdate);

    return () => {
      mounted = false;
      window.removeEventListener("mediascraper:jobs", handleJobsUpdate);
    };
  }, []);

  if (!metrics) return null;

  return (
    <div
      className="media-active-jobs-badge"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "12px",
        padding: "3px 10px",
        marginTop: "0.75rem",
        marginBottom: "0.75rem",
        fontSize: "0.7rem",
        fontWeight: 500,
        color: "var(--text-secondary, #6b7280)",
        background: "var(--bg-tertiary, #f3f4f6)",
        border: "1px solid var(--border-color, #e5e7eb)",
        borderRadius: "6px",
        letterSpacing: "0.01em",
        width: "fit-content"
      }}
    >
      {metrics.active_jobs > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div 
            style={{
              width: "12px",
              height: "12px",
              borderRadius: "50%",
              border: "2px solid rgba(187, 134, 252, 0.3)",
              borderTopColor: "#bb86fc",
              animation: "spin 1s linear infinite"
            }}
          />
          <span style={{ color: "#bb86fc" }}>{metrics.active_jobs} running</span>
        </div>
      )}
      <div style={{ display: "flex", gap: "10px", opacity: 0.8 }}>
        <span>{metrics.cache_hits_1h} hit{metrics.cache_hits_1h !== 1 ? 's' : ''}/h</span>
        <span>{metrics.new_scrapes_1h} new/h</span>
      </div>
    </div>
  );
}
