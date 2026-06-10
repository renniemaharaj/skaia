import { useEffect, useState } from "react";
import { apiRequest } from "../../utils/api";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

export function ActiveJobsBadge({ canEdit }: { canEdit?: boolean }) {
  const [metrics, setMetrics] = useState<{ active_jobs: number; cache_hits_1h: number; new_scrapes_1h: number } | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);

  const handleRestart = async () => {
    try {
      setIsRestarting(true);
      await apiRequest("/mediascraper/restart", { method: "POST" });
      toast.success("Jobs cleared and browser restarted!");
    } catch (err: any) {
      toast.error(err.message || "Failed to restart jobs");
    } finally {
      setIsRestarting(false);
    }
  };

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
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
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
            <span style={{ color: "#bb86fc" }}>1 scraping</span>
          </div>
          {metrics.active_jobs > 1 && (
            <span style={{ color: "var(--text-secondary)" }}>
              {metrics.active_jobs - 1} queued
            </span>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: "10px", opacity: 0.8, alignItems: "center" }}>
        <span>{metrics.cache_hits_1h} cache hit{metrics.cache_hits_1h !== 1 ? 's' : ''}/h</span>
        <span>{metrics.new_scrapes_1h} cache miss{metrics.new_scrapes_1h !== 1 ? 'es' : ''}/h</span>
        {canEdit && (
          <button
            onClick={handleRestart}
            disabled={isRestarting}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "2px",
              marginLeft: "4px",
              display: "flex",
              alignItems: "center",
              color: "inherit",
              opacity: isRestarting ? 0.5 : 1
            }}
            title="Restart Scraper Jobs"
          >
            <RefreshCw size={12} className={isRestarting ? "spin" : ""} />
          </button>
        )}
      </div>
    </div>
  );
}
