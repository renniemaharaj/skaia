import { atom } from "jotai";
import { apiRequest } from "../utils/api";

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB

export type UploadStatus = "queued" | "initializing" | "uploading" | "rebuilding" | "complete" | "error";

export interface ChunkStatus {
  index: number;
  status: "pending" | "uploading" | "complete" | "error";
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
  chunks: ChunkStatus[];
}

export const activeUploadsAtom = atom<UploadJob[]>([]);

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

  async upload(file: File, options?: { uploadType?: string }): Promise<any> {
    const id = Math.random().toString(36).substring(2, 9);
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE) || 1;
    
    let defaultType = "file";
    if (file.type.startsWith("image/")) defaultType = "image";
    else if (file.type.startsWith("video/")) defaultType = "video";
    
    const finalUploadType = options?.uploadType || defaultType;

    const job: UploadJob & { _uploadType?: string } = {
      id,
      file,
      filename: file.name,
      size: file.size,
      totalChunks,
      uploadedChunks: 0,
      status: "queued",
      _uploadType: finalUploadType,
      chunks: Array.from({ length: totalChunks }).map((_, i) => ({
        index: i,
        status: "pending"
      }))
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
      const initRes = await apiRequest<{ upload_id: string }>("/upload/chunked/init", {
        method: "POST",
        body: JSON.stringify({
          filename: nextJob.filename,
          total_chunks: nextJob.totalChunks,
          total_size: nextJob.size,
          upload_type: (nextJob as any)._uploadType,
        }),
      });

      if (!initRes) throw new Error("Failed to init chunked upload");
      const uploadId = initRes.upload_id;

      nextJob.status = "uploading";
      nextJob._lastChunkStartTime = Date.now();
      this.dispatchStoreUpdate();

      const CONCURRENCY = 4;
      let currentIndex = 0;

      const uploadWorker = async () => {
        while (true) {
          const idx = currentIndex++;
          if (idx >= nextJob.totalChunks) break;

          nextJob.chunks[idx].status = "uploading";
          this.dispatchStoreUpdate();

          const start = idx * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, nextJob.size);
          const chunk = nextJob.file.slice(start, end);

          const fd = new FormData();
          fd.append("chunk_index", idx.toString());
          fd.append("file", chunk);

          const startTime = Date.now();
          try {
            await apiRequest(`/upload/chunked/upload/${uploadId}`, {
              method: "POST",
              body: fd,
            });
            nextJob.chunks[idx].status = "complete";
          } catch (e) {
            nextJob.chunks[idx].status = "error";
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

      nextJob.status = "rebuilding";
      this.dispatchStoreUpdate();

      const completeRes = await apiRequest(`/upload/chunked/complete/${uploadId}`, {
        method: "POST",
      });

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
      
      // Cleanup after a bit
      setTimeout(() => {
        this.queue = this.queue.filter(j => j.id !== nextJob.id);
        this.resolveMap.delete(nextJob.id);
        this.dispatchStoreUpdate();
      }, 3000);

      this.processQueue();
    }
  }

  cancelUpload(_id: string) {
    // TODO: support cancellation
  }
}

export const uploader = new UploadManager();
