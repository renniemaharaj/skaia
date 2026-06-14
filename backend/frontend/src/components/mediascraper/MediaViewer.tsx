import { useState } from "react";
import { createPortal } from "react-dom";
import { TableView } from "../ui/TableView/TableView";
import "./MediaScraper.css";

export type ScrapeStatus = "pending" | "scraping" | "done" | "error";

export interface MediaScrapeJob {
  url: string;
  status: ScrapeStatus;
  images?: string[];
  lastScanned?: string;
  error?: string;
}

export function MediaViewer({ job }: { job: MediaScrapeJob }) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  let rows: any[] = [];
  
  if (job.status !== "done") {
     rows = [{
       id: "job",
       thumbnail: null,
       link: job.url,
       status: job.status === "pending" ? "Pending..." : job.status === "scraping" ? "Scraping..." : "Error",
       lastScanned: "-",
       isImage: false
     }];
  } else if (job.images && job.images.length > 0) {
     rows = job.images.map((img, idx) => ({
       id: `img-${idx}`,
       thumbnail: img,
       link: img,
       status: "Result",
       lastScanned: job.lastScanned ? new Date(job.lastScanned).toLocaleString() : "-",
       isImage: true,
       index: idx
     }));
  } else {
     rows = [{
       id: "job-empty",
       thumbnail: null,
       link: job.url,
       status: "No images found",
       lastScanned: job.lastScanned ? new Date(job.lastScanned).toLocaleString() : "-",
       isImage: false
     }];
  }

  const columns = [
    {
      header: "Preview",
      cell: (item: any) => {
        if (item.isImage) {
          return <img src={item.thumbnail} alt="thumbnail" className="media-thumbnail" style={{ width: "40px", height: "40px", objectFit: "cover", borderRadius: "4px" }} />;
        }
        if (item.status === "Scraping...") {
           return <div className="media-spinner"></div>;
        }
        return <div className="media-placeholder">-</div>;
      },
      width: "60px",
    },
    {
      header: "Link",
      cell: (item: any) => (
        <a href={item.link} target="_blank" rel="noreferrer" className="media-url-cell" onClick={(e) => {
            e.stopPropagation();
        }}>
          {item.link}
        </a>
      ),
      width: "1fr",
      className: "table-view__cell--bold",
    },
    {
      header: "Status",
      cell: (item: any) => <div className="media-status-cell">{item.status}</div>,
      width: "120px",
    },
    {
      header: "Last Scanned",
      cell: (item: any) => <div className="media-time-cell">{item.lastScanned}</div>,
      width: "180px",
      className: "table-view__cell--light",
    }
  ];

  return (
    <div className="media-viewer">
      <div className="media-viewer-list">
        <TableView 
          data={rows} 
          columns={columns} 
          rowKey={(item) => item.id}
          renderRowWrapper={(item, _index, rowProps, cells) => (
            <div 
              {...rowProps} 
              className={`${rowProps.className} media-row`}
              onClick={() => {
                 if (item.isImage) setSelectedImage(item.link);
              }}
              style={{ ...rowProps.style, cursor: item.isImage ? "pointer" : "default" }}
            >
              {cells}
            </div>
          )}
        />
      </div>

      {selectedImage && typeof document !== "undefined" && createPortal(
        <div
          className="up-upload-lightbox"
          onClick={() => setSelectedImage(null)}
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <div
            className="up-upload-lightbox-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "90vw",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column"
            }}
          >
            <img src={selectedImage} alt="Preview" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
