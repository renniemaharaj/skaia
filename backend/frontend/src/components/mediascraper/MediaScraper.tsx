import { useState, useEffect } from "react";
import { apiRequest } from "../../utils/api";
import { MediaViewer, type MediaScrapeJob } from "./MediaViewer";
import { toast } from "sonner";
import "./MediaScraper.css";

export function MediaScraper() {
  const [url, setUrl] = useState("");
  const [job, setJob] = useState<MediaScrapeJob | null>(null);

  useEffect(() => {
    const handleResult = (e: Event) => {
      const customEvent = e as CustomEvent<{
        url: string;
        result?: { images: string[]; last_scanned: string };
        error?: string;
      }>;
      const data = customEvent.detail;
      if (data.url === url && job?.status === "scraping") {
        if (data.error) {
          setJob({ url, status: "error", error: data.error });
          toast.error(`Scrape failed: ${data.error}`);
        } else if (data.result && data.result.images && data.result.images.length > 0) {
          setJob({
            url,
            status: "done",
            images: data.result.images,
            lastScanned: data.result.last_scanned,
          });
          toast.success(`Scraped ${data.result.images.length} images`);
        } else {
          setJob({ url, status: "done", images: [], lastScanned: data.result?.last_scanned });
          toast.info("No images found on this URL");
        }
      }
    };

    const handleStarted = (e: Event) => {
      const customEvent = e as CustomEvent<{ url: string }>;
      const data = customEvent.detail;
      if (data.url === url && job?.status === "pending") {
        setJob({ url, status: "scraping" });
      }
    };

    const handlePending = (e: Event) => {
      const customEvent = e as CustomEvent<{ url: string }>;
      const data = customEvent.detail;
      if (data.url === url && (job?.status === "scraping" || job?.status === "pending")) {
        setJob({ url, status: "pending" });
        // The user must click scrape again manually, or we could auto trigger,
        // but since this is the explicit tester UI, just setting to pending is safe
        // and provides a natural update
      }
    };

    window.addEventListener("mediascraper:result", handleResult);
    window.addEventListener("mediascraper:started", handleStarted);
    window.addEventListener("mediascraper:pending", handlePending);
    return () => {
      window.removeEventListener("mediascraper:result", handleResult);
      window.removeEventListener("mediascraper:started", handleStarted);
      window.removeEventListener("mediascraper:pending", handlePending);
    };
  }, [url, job?.status]);

  const handleScrape = async () => {
    if (!url) {
      toast.error("Please enter a URL to scrape");
      return;
    }
    setJob({ url, status: "pending" });
    try {
      const res = await apiRequest<{ images?: string[]; last_scanned?: string; status?: string }>(
        `/mediascraper/scrape?url=${encodeURIComponent(url)}`,
        {
          method: "GET",
        }
      );
      // If it returned instantly from cache
      if (res && res.images) {
        if (res.images.length > 0) {
          setJob({ url, status: "done", images: res.images, lastScanned: res.last_scanned });
          toast.success(`Scraped ${res.images.length} images`);
        } else {
          setJob({ url, status: "done", images: [], lastScanned: res.last_scanned });
          toast.info("No images found on this URL");
        }
      } else {
        // Just queued, we will wait for WS
      }
    } catch (e: any) {
      if (e.status === 401) {
        setJob({ url, status: "error", error: "Please sign in to continue" });
        toast.error("Please sign in to continue");
      } else {
        const msg = "An unexpected error occurred";
        setJob({ url, status: "error", error: msg });
        toast.error(msg);
      }
    }
  };

  return (
    <div className="media-scraper-container">
      <h2>Media Scraper</h2>
      <div className="media-scraper-input-group">
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="Enter website URL..."
          className="media-scraper-input"
          onKeyDown={e => e.key === "Enter" && handleScrape()}
        />
        <button
          onClick={handleScrape}
          disabled={job?.status === "scraping"}
          className="media-scraper-button"
        >
          {job?.status === "scraping" ? "Scraping..." : "Scrape"}
        </button>
      </div>

      {job && (
        <div className="media-scraper-results">
          <MediaViewer job={job} />
        </div>
      )}
    </div>
  );
}
