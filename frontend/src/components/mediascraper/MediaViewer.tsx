import { useState } from "react";
import { MediaPlaceholder } from "../ui/MediaPlaceholder";
import { MediaPreviewLightbox } from "../ui/MediaPreviewLightbox";
import { TableView } from "../ui/TableView/TableView";
import "../ui/MediaPreviewLightbox.css";
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
    rows = [
      {
        id: "job",
        thumbnail: null,
        link: job.url,
        status:
          job.status === "pending"
            ? "Pending..."
            : job.status === "scraping"
              ? "Scraping..."
              : "Error",
        lastScanned: "-",
        isImage: false,
      },
    ];
  } else if (job.images && job.images.length > 0) {
    rows = job.images.map((img, idx) => ({
      id: `img-${idx}`,
      thumbnail: img,
      link: img,
      status: "Result",
      lastScanned: job.lastScanned ? new Date(job.lastScanned).toLocaleString() : "-",
      isImage: true,
      index: idx,
    }));
  } else {
    rows = [
      {
        id: "job-empty",
        thumbnail: null,
        link: job.url,
        status: "No images found",
        lastScanned: job.lastScanned ? new Date(job.lastScanned).toLocaleString() : "-",
        isImage: false,
      },
    ];
  }

  const columns = [
    {
      header: "Preview",
      cell: (item: any) => {
        if (item.isImage) {
          return (
            <MediaPlaceholder
              alt="thumbnail"
              className="media-thumbnail"
              fit="cover"
              href={item.thumbnail}
              layout="thumbnail"
              mediaType="image"
              preserveFrame
              showCaption={false}
              size={{ height: 40, width: 40 }}
            />
          );
        }
        if (item.status === "Scraping...") {
          return <div className="media-spinner" />;
        }
        return <div className="media-viewer-placeholder">-</div>;
      },
      width: "60px",
    },
    {
      header: "Link",
      cell: (item: any) => (
        <a
          href={item.link}
          target="_blank"
          rel="noreferrer"
          className="media-url-cell"
          onClick={e => {
            e.stopPropagation();
          }}
        >
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
      className: "table-view__cell--muted",
    },
  ];

  return (
    <div className="media-viewer">
      <div className="media-viewer-list">
        <TableView
          data={rows}
          columns={columns}
          rowKey={item => item.id}
          renderRowWrapper={(item, _index, rowProps, cells) => (
            <div
              {...rowProps}
              className={rowProps.className}
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

      {selectedImage && (
        <MediaPreviewLightbox
          items={[{ url: selectedImage, filename: "Scraped image", type: "image" }]}
          index={0}
          onClose={() => setSelectedImage(null)}
        />
      )}
    </div>
  );
}
