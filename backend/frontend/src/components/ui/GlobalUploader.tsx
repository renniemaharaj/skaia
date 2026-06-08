import { useEffect, useState } from "react";
import { useAtom } from "jotai";
import { activeUploadsAtom, showUploadManagerAtom, uploader } from "../../atoms/uploadAtom";
import { UploadCloud, CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronUp, ChevronRight, RefreshCw, X } from "lucide-react";
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
  const [showManager, setShowManager] = useAtom(showUploadManagerAtom);
  const [minimized, setMinimized] = useState(false);
  const [completedCollapsed, setCompletedCollapsed] = useState(false);

  useEffect(() => {
    uploader.loadIncompleteUploads();
    uploader.setStoreDispatcher(() => {
      setJobs([...uploader.getJobs()]);
    });
  }, [setJobs]);

  if (jobs.length === 0 && !showManager) return null;

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
            <span>Upload Manager {overallPercent < 100 && jobs.length > 0 ? `(${overallPercent}%)` : ""}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {minimized ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            {showManager && jobs.length === 0 && (
              <X 
                size={18} 
                onClick={(e) => { e.stopPropagation(); setShowManager(false); }} 
              />
            )}
          </div>
        </div>
        
        {!minimized && (
          <div className="global-uploader-list-container">
            {jobs.length === 0 ? (
              <div style={{ padding: "16px", textAlign: "center", color: "var(--text-secondary)", fontSize: "13px" }}>
                No active or recent uploads
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function JobItem({ job, defaultExpanded }: { job: any, defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);

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

  const pendingCount = job.chunks?.filter((c: any) => c.status === "pending").length || 0;
  const completedCount = job.chunks?.filter((c: any) => c.status === "complete").length || 0;
  const uploadingChunks = job.chunks?.filter((c: any) => c.status === "uploading" || c.status === "error") || [];

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
          {job.status === "error" ? (
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <button 
                onClick={(e) => { e.stopPropagation(); uploader.retryUpload(job.id); }}
                className="icon-btn icon-btn--subtle" 
                title="Retry Upload"
                style={{ padding: "4px" }}
              >
                <RefreshCw size={14} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); uploader.removeUpload(job.id); }}
                className="icon-btn icon-btn--danger" 
                title="Dismiss"
                style={{ padding: "4px" }}
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            statusIcon
          )}
        </div>
        {(job.status === "uploading" || job.status === "rebuilding") && (
          <div className="global-uploader-progress-bar">
            <div className="global-uploader-progress-fill" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>

      {expanded && job.chunks && job.chunks.length > 0 && (
        <div className="global-uploader-chunks-container">
          <div className="global-uploader-chunks-live">
            
            {completedCount > 0 && (
              <div className="global-uploader-chunk chunk-rollup-completed">
                <span>{completedCount} Completed {completedCount === 1 ? 'Part' : 'Parts'}</span>
                <span className="global-uploader-chunk-status status-complete">
                  <CheckCircle2 size={14} />
                </span>
              </div>
            )}
            
            {uploadingChunks.map((c: any) => (
              <div key={c.index} className="global-uploader-chunk chunk-active">
                <span>Part {c.index + 1}</span>
                <span className={`global-uploader-chunk-status status-${c.status}`}>{c.status}</span>
              </div>
            ))}

            {pendingCount > 0 && (
              <div className="global-uploader-chunk chunk-rollup-pending">
                <span>{pendingCount} Pending {pendingCount === 1 ? 'Part' : 'Parts'}</span>
                <span className="global-uploader-chunk-status status-pending">waiting</span>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
