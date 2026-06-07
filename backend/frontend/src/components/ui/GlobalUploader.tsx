import { useEffect, useState } from "react";
import { useAtom } from "jotai";
import { activeUploadsAtom, uploader } from "../../atoms/uploadAtom";
import { UploadCloud, CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronUp, ChevronRight } from "lucide-react";
import "./GlobalUploader.css";

function formatETA(seconds: number) {
  if (!isFinite(seconds) || seconds < 0) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return `~${parts.join(" ")}`;
}

export default function GlobalUploader() {
  const [jobs, setJobs] = useAtom(activeUploadsAtom);
  const [minimized, setMinimized] = useState(false);
  const [completedCollapsed, setCompletedCollapsed] = useState(false);

  useEffect(() => {
    uploader.setStoreDispatcher(() => {
      setJobs([...uploader.getJobs()]);
    });
  }, [setJobs]);

  if (jobs.length === 0) return null;

  const activeJobs = jobs.filter(j => ["queued", "initializing", "uploading", "error"].includes(j.status));
  const completedJobs = jobs.filter(j => ["rebuilding", "complete"].includes(j.status));

  const totalChunks = jobs.reduce((acc, job) => acc + job.totalChunks, 0);
  const uploadedChunks = jobs.reduce((acc, job) => acc + job.uploadedChunks, 0);
  const overallPercent = totalChunks > 0 ? Math.round((uploadedChunks / totalChunks) * 100) : 0;

  return (
    <div className="global-uploader-overlay">
      <div className="global-uploader-modal">
        <div 
          className="global-uploader-header" 
          onClick={() => setMinimized(!minimized)} 
          style={{ cursor: "pointer", justifyContent: "space-between" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <UploadCloud size={20} />
            <span>Upload Manager {overallPercent < 100 ? `(${overallPercent}%)` : ""}</span>
          </div>
          {minimized ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
        
        {!minimized && (
          <div className="global-uploader-list-container">
            {activeJobs.length > 0 && (
              <div className="global-uploader-list">
                {activeJobs.map(job => (
                  <JobItem key={job.id} job={job} defaultExpanded={true} />
                ))}
              </div>
            )}
            
            {completedJobs.length > 0 && (
              <div className="global-uploader-completed-section">
                <div 
                  className="global-uploader-completed-header" 
                  onClick={() => setCompletedCollapsed(!completedCollapsed)}
                >
                  <span>Processing & Completed ({completedJobs.length})</span>
                  {completedCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                </div>
                {!completedCollapsed && (
                  <div className="global-uploader-list" style={{ paddingTop: "16px" }}>
                    {completedJobs.map(job => (
                      <JobItem key={job.id} job={job} defaultExpanded={false} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function JobItem({ job, defaultExpanded }: { job: any, defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  const [completedChunksExpanded, setCompletedChunksExpanded] = useState(false);

  const percent = job.totalChunks > 0 
    ? Math.round((job.uploadedChunks / job.totalChunks) * 100) 
    : 0;

  let statusIcon = <Loader2 size={16} className="spin" style={{ color: "var(--text-secondary)" }} />;
  if (job.status === "complete") statusIcon = <CheckCircle2 size={16} style={{ color: "var(--success-color)" }} />;
  if (job.status === "error") statusIcon = <AlertCircle size={16} style={{ color: "var(--error-color)" }} />;

  const etaStr = job.etaSeconds && isFinite(job.etaSeconds) 
    ? formatETA(job.etaSeconds) 
    : "";
    
  const speedStr = job.speedBps && isFinite(job.speedBps)
    ? `${(job.speedBps / 1024 / 1024).toFixed(1)} MB/s`
    : "";

  const liveChunks = job.chunks?.filter((c: any) => c.status !== "complete") || [];
  const completedChunks = job.chunks?.filter((c: any) => c.status === "complete") || [];

  return (
    <div className="global-uploader-item-container">
      <div className="global-uploader-item" onClick={() => setExpanded(!expanded)} style={{ cursor: "pointer" }}>
        <div className="global-uploader-item-info">
          <span className="global-uploader-filename" title={job.filename}>{job.filename}</span>
          <div className="global-uploader-meta">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {job.status === "uploading" && (
              <span className="global-uploader-stats">{percent}% • {speedStr} {etaStr ? `• ${etaStr}` : ""}</span>
            )}
            {job.status === "rebuilding" && <span className="global-uploader-stats">Rebuilding...</span>}
            {job.status === "queued" && <span className="global-uploader-stats">Queued</span>}
            {job.status === "initializing" && <span className="global-uploader-stats">Initializing...</span>}
            {job.status === "error" && <span className="global-uploader-error">{job.error}</span>}
            {job.status === "complete" && <span className="global-uploader-success">Done</span>}
          </div>
        </div>
        <div className="global-uploader-item-status">
          {statusIcon}
        </div>
        {(job.status === "uploading" || job.status === "rebuilding") && (
          <div className="global-uploader-progress-bar">
            <div className="global-uploader-progress-fill" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>

      {expanded && job.chunks && job.chunks.length > 0 && (
        <div className="global-uploader-chunks-container">
          {liveChunks.length > 0 && (
            <div className="global-uploader-chunks-live">
              {liveChunks.map((c: any) => (
                <div key={c.index} className="global-uploader-chunk">
                  <span>Part {c.index + 1}</span>
                  <span className={`global-uploader-chunk-status status-${c.status}`}>{c.status}</span>
                </div>
              ))}
            </div>
          )}
          
          {completedChunks.length > 0 && (
            <div className="global-uploader-chunks-completed-section">
              <div 
                className="global-uploader-chunks-completed-header"
                onClick={(e) => { e.stopPropagation(); setCompletedChunksExpanded(!completedChunksExpanded); }}
              >
                <span>Completed Parts ({completedChunks.length})</span>
                {completedChunksExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>
              {completedChunksExpanded && (
                <div className="global-uploader-chunks-completed-list">
                  {completedChunks.map((c: any) => (
                    <div key={c.index} className="global-uploader-chunk">
                      <span>Part {c.index + 1}</span>
                      <span className="global-uploader-chunk-status status-complete">complete</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
