import { useEffect } from "react";
import { useAtom } from "jotai";
import { activeUploadsAtom, uploader } from "../../atoms/uploadAtom";
import { UploadCloud, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import "./GlobalUploader.css";

export default function GlobalUploader() {
  const [jobs, setJobs] = useAtom(activeUploadsAtom);

  useEffect(() => {
    uploader.setStoreDispatcher(() => {
      setJobs([...uploader.getJobs()]);
    });
  }, [setJobs]);

  if (jobs.length === 0) return null;

  return (
    <div className="global-uploader-overlay">
      <div className="global-uploader-modal">
        <div className="global-uploader-header">
          <UploadCloud size={20} />
          <span>Upload Manager</span>
        </div>
        <div className="global-uploader-list">
          {jobs.map(job => {
            const percent = job.totalChunks > 0 
              ? Math.round((job.uploadedChunks / job.totalChunks) * 100) 
              : 0;

            let statusIcon = <Loader2 size={16} className="spin" />;
            if (job.status === "complete") statusIcon = <CheckCircle2 size={16} className="text-success" />;
            if (job.status === "error") statusIcon = <AlertCircle size={16} className="text-error" />;

            const etaStr = job.etaSeconds && isFinite(job.etaSeconds) 
              ? `~${Math.round(job.etaSeconds)}s` 
              : "";
              
            const speedStr = job.speedBps && isFinite(job.speedBps)
              ? `${(job.speedBps / 1024 / 1024).toFixed(1)} MB/s`
              : "";

            return (
              <div key={job.id} className="global-uploader-item">
                <div className="global-uploader-item-info">
                  <span className="global-uploader-filename" title={job.filename}>{job.filename}</span>
                  <div className="global-uploader-meta">
                    {job.status === "uploading" && (
                      <span className="global-uploader-stats">{percent}% • {speedStr} {etaStr ? `• ${etaStr}` : ""}</span>
                    )}
                    {job.status === "rebuilding" && <span className="global-uploader-stats">Rebuilding...</span>}
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
            );
          })}
        </div>
      </div>
    </div>
  );
}
