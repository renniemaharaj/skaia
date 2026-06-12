import { atom } from "jotai";
import { apiRequest } from "../utils/api";
import { customAlert } from "../components/ui/Prompt";

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

export type UploadStatus = "queued" | "initializing" | "uploading" | "rebuilding" | "complete" | "error" | "paused";

export interface ChunkStatus {
  index: number;
  status: "pending" | "uploading" | "complete" | "error";
}

export interface IncompleteUpload {
  upload_id: string;
  filename: string;
  total_chunks: number;
  total_size: number;
  completed_chunks: number[];
  upload_type: string;
}

export interface UploadJob {
  id: string;
  file: File;
  filename: string;
  size: number;
  totalChunks: number;
  uploadedChunks: number;
  status: UploadStatus;
  error?: string;
  etaSeconds?: number;
  speedBps?: number;
  _lastChunkStartTime?: number;
  _completedSet?: Set<number>;
  activeChunks?: { index: number; status: "uploading" | "error" }[];
}

export const activeUploadsAtom = atom<UploadJob[]>([]);
export const showUploadManagerAtom = atom(false);

class UploadManager {
  private queue: UploadJob[] = [];
  private activeCount = 0;
  private MAX_CONCURRENT_UPLOADS = 1;
  private dispatchStoreUpdate: () => void = () => {};
  private resolveMap = new Map<string, { resolve: (val: any) => void, reject: (err: any) => void }>();

  setStoreDispatcher(dispatcher: () => void) {
    this.dispatchStoreUpdate = dispatcher;
  }

  getJobs() {
    return this.queue;
  }

  async upload(file: File, options?: { uploadType?: string; inboxConversationId?: string }): Promise<any> {
    const id = Math.random().toString(36).substring(2, 9);
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE) || 1;
    
    let defaultType = "file";
    if (file.type.startsWith("image/")) defaultType = "image";
    else if (file.type.startsWith("video/")) defaultType = "video";
    
    const finalUploadType = options?.uploadType || defaultType;

    const job: UploadJob & { _uploadType?: string; _inboxConversationId?: string } = {
      id,
      file,
      filename: file.name,
      size: file.size,
      totalChunks,
      uploadedChunks: 0,
      status: "queued",
      _uploadType: finalUploadType,
      _inboxConversationId: options?.inboxConversationId,
      activeChunks: [],
      _completedSet: new Set()
    };

    this.queue.push(job);
    this.dispatchStoreUpdate();

    const promise = new Promise<any>((resolve, reject) => {
      this.resolveMap.set(id, { resolve, reject });
    });

    this.processQueue();
    return promise;
  }

  private async processQueue() {
    if (this.activeCount >= this.MAX_CONCURRENT_UPLOADS) return;
    
    const nextJob = this.queue.find(j => j.status === "queued");
    if (!nextJob) return;

    this.activeCount++;
    nextJob.status = "initializing";
    this.dispatchStoreUpdate();

    try {
      const fingerprint = btoa(encodeURIComponent(`${nextJob.filename}-${nextJob.size}-${nextJob.file.lastModified || 0}`)).replace(/[/+=]/g, '_');
      const initRes = await apiRequest<{ upload_id: string, completed_chunks?: number[] }>("/upload/chunked/init", {
        method: "POST",
        body: JSON.stringify({
          filename: nextJob.filename,
          total_chunks: nextJob.totalChunks,
          total_size: nextJob.size,
          upload_type: (nextJob as any)._uploadType,
          fingerprint: fingerprint,
        }),
      });

      if (!initRes) throw new Error("Failed to init chunked upload");
      const uploadId = initRes.upload_id;
      const completedChunks = initRes.completed_chunks || [];
      
      nextJob._completedSet = new Set(completedChunks);
      nextJob.uploadedChunks = completedChunks.length;
      nextJob.activeChunks = [];

      nextJob.status = "uploading";
      nextJob._lastChunkStartTime = Date.now();
      this.dispatchStoreUpdate();

      const CONCURRENCY = 4;
      let currentIndex = 0;

      const uploadWorker = async () => {
        while (true) {
          if ((nextJob.status as UploadStatus) === "paused" || (nextJob.status as UploadStatus) === "error") break;

          let idx = currentIndex++;
          if (idx >= nextJob.totalChunks) break;

          if (nextJob._completedSet?.has(idx)) continue;

          let activeChunk: { index: number; status: "uploading" | "error" } = { index: idx, status: "uploading" };
          nextJob.activeChunks!.push(activeChunk);
          this.dispatchStoreUpdate();

          const start = idx * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, nextJob.size);
          const chunk = nextJob.file.slice(start, end);

          const startTime = Date.now();
          try {
            await apiRequest(`/upload/chunked/upload/${uploadId}?chunk_index=${idx}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/octet-stream"
              },
              body: chunk,
            });
            if ((nextJob.status as UploadStatus) === "paused") {
              nextJob.activeChunks = nextJob.activeChunks!.filter(c => c.index !== idx);
              continue;
            }
            nextJob._completedSet!.add(idx);
            nextJob.activeChunks = nextJob.activeChunks!.filter(c => c.index !== idx);
          } catch (e) {
            activeChunk.status = "error";
            nextJob.status = "error";
            throw e;
          }

          const timeTaken = Date.now() - startTime;
          const speed = chunk.size / (timeTaken / 1000);

          nextJob.uploadedChunks++;
          nextJob.speedBps = speed;
          
          const remainingChunks = nextJob.totalChunks - nextJob.uploadedChunks;
          const chunksPerSecond = speed / CHUNK_SIZE;
          nextJob.etaSeconds = remainingChunks / chunksPerSecond;

          this.dispatchStoreUpdate();
        }
      };

      const workers = [];
      for (let i = 0; i < CONCURRENCY; i++) workers.push(uploadWorker());
      await Promise.all(workers);

      if ((nextJob.status as UploadStatus) === "paused") {
        return; // Exits try block and goes to finally
      }
      if ((nextJob.status as UploadStatus) === "error") {
        throw new Error("Upload failed");
      }

      nextJob.status = "rebuilding";
      this.dispatchStoreUpdate();

      const completeRes = await apiRequest<any>(`/upload/chunked/complete/${uploadId}`, {
        method: "POST",
      });

      if ((nextJob as any)._inboxConversationId) {
        try {
          let messageType = "file";
          if (nextJob.file.type.startsWith("image/")) messageType = "image";
          else if (nextJob.file.type.startsWith("video/")) messageType = "video";
          else if (nextJob.file.type.startsWith("audio/")) messageType = "audio";

          await apiRequest(
            `/inbox/conversations/${(nextJob as any)._inboxConversationId}/messages`,
            {
              method: "POST",
              body: JSON.stringify({
                content: nextJob.filename,
                message_type: messageType,
                attachment_url: completeRes.url,
                attachment_name: nextJob.filename,
                attachment_size: nextJob.size,
                attachment_mime: nextJob.file.type,
              }),
            }
          );
        } catch (e) {
          console.error("Failed to send inbox message from background upload", e);
        }
      }

      nextJob.status = "complete";
      this.dispatchStoreUpdate();

      const p = this.resolveMap.get(nextJob.id);
      if (p) p.resolve(completeRes);
    } catch (err: any) {
      nextJob.status = "error";
      nextJob.error = err.message;
      this.dispatchStoreUpdate();
      
      const p = this.resolveMap.get(nextJob.id);
      if (p) p.reject(err);
    } finally {
      this.activeCount--;
      
      // Cleanup after a bit, but keep errors and paused visible
      if ((nextJob.status as UploadStatus) !== "error" && (nextJob.status as UploadStatus) !== "paused") {
        setTimeout(() => {
          this.queue = this.queue.filter(j => j.id !== nextJob.id);
          this.resolveMap.delete(nextJob.id);
          this.dispatchStoreUpdate();
        }, 3000);
      }

      this.processQueue();
    }
  }

  async loadIncompleteUploads() {
    try {
      const res = await apiRequest<IncompleteUpload[]>("/upload/chunked/incomplete");
      if (!res) return;
      let changed = false;
      for (const inc of res) {
        if (this.queue.some(j => j.id === inc.upload_id)) continue;
        
        const job: UploadJob & { _uploadType?: string } = {
          id: inc.upload_id,
          file: null as any,
          filename: inc.filename,
          size: inc.total_size,
          totalChunks: inc.total_chunks,
          uploadedChunks: inc.completed_chunks.length,
          status: "error",
          error: "Incomplete upload. Click Retry and select the original file to resume.",
          _uploadType: inc.upload_type,
          _completedSet: new Set(inc.completed_chunks),
          activeChunks: []
        };
        this.queue.push(job);
        changed = true;
      }
      if (changed) this.dispatchStoreUpdate();
    } catch (e) {
      console.error("Failed to load incomplete uploads", e);
    }
  }

  retryUpload(id: string) {
    const job = this.queue.find(j => j.id === id);
    if (!job || job.status !== "error") return;
    
    if (!job.file) {
      const input = document.createElement('input');
      input.type = 'file';
      input.onchange = (e: any) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.name !== job.filename || file.size !== job.size) {
          customAlert(`File mismatch. Expected: ${job.filename} (${Math.round(job.size / 1024 / 1024)}MB). Please select the exact original file.`);
          return;
        }
        job.file = file;
        this.doRetry(job);
      };
      input.click();
      return;
    }
    
    this.doRetry(job);
  }

  private doRetry(job: UploadJob) {
    job.status = "queued";
    job.error = undefined;
    
    this.dispatchStoreUpdate();
    this.processQueue();
  }

  async removeUpload(id: string) {
    this.queue = this.queue.filter(j => j.id !== id);
    this.resolveMap.delete(id);
    this.dispatchStoreUpdate();

    try {
      await apiRequest(`/upload/chunked/incomplete/${id}`, { method: "DELETE" });
    } catch {}
  }

  pauseUpload(id: string) {
    const job = this.queue.find(j => j.id === id);
    if (!job || !["queued", "initializing", "uploading"].includes(job.status)) return;
    
    job.status = "paused";
    this.dispatchStoreUpdate();
  }

  resumeUpload(id: string) {
    const job = this.queue.find(j => j.id === id);
    if (!job || job.status !== "paused") return;
    
    if (!job.file) {
      job.status = "error";
      job.error = "File missing. Click Retry to re-select it.";
      this.dispatchStoreUpdate();
      return;
    }
    
    this.doRetry(job);
  }

  pauseAll() {
    let changed = false;
    this.queue.forEach(j => {
      if (["queued", "initializing", "uploading"].includes(j.status)) {
        j.status = "paused";
        changed = true;
      }
    });
    if (changed) this.dispatchStoreUpdate();
  }

  resumeAll() {
    let triggered = false;
    this.queue.forEach(job => {
      if (job.status === "paused" || job.status === "error") {
        if (job.file) {
          job.status = "queued";
          job.error = undefined;
          triggered = true;
        } else {
          if (job.status === "paused") {
            job.status = "error";
            job.error = "File missing. Click Retry to re-select it.";
            triggered = true;
          }
        }
      }
    });
    
    if (triggered) {
      this.dispatchStoreUpdate();
      this.processQueue();
    }
  }

  cancelUpload(_id: string) {
    // TODO: support cancellation
  }
}

export const uploader = new UploadManager();
