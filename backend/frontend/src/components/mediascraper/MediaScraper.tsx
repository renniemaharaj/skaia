import { useState } from "react";
import { apiRequest } from "../../utils/api";
import { MediaViewer, type MediaScrapeJob } from "./MediaViewer";
import { toast } from "sonner";
import "./MediaScraper.css";

export function MediaScraper() {
  const [url, setUrl] = useState("");
  const [job, setJob] = useState<MediaScrapeJob | null>(null);

  const handleScrape = async () => {
    if (!url) {
      toast.error("Please enter a URL to scrape");
      return;
    }
    setJob({ url, status: "scraping" });
    try {
      const res = await apiRequest<{images: string[], last_scanned: string}>(`/mediascraper/scrape?url=${encodeURIComponent(url)}`, {
        method: "GET"
      });
      if (res && res.images && res.images.length > 0) {
        setJob({ url, status: "done", images: res.images, lastScanned: res.last_scanned });
        toast.success(`Scraped ${res.images.length} images`);
      } else {
        setJob({ url, status: "done", images: [], lastScanned: res?.last_scanned });
        toast.info("No images found on this URL");
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
          onChange={(e) => setUrl(e.target.value)} 
          placeholder="Enter website URL..."
          className="media-scraper-input"
          onKeyDown={(e) => e.key === 'Enter' && handleScrape()}
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
