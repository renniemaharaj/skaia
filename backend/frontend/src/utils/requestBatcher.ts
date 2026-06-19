export interface RequestBatcherOptions<K, V> {
  loadBatch: (keys: K[]) => Promise<Map<K, V>>;
  windowMs?: number;
  maxBatchSize?: number;
}

interface PendingRequest<V> {
  promise: Promise<V>;
  resolve: (value: V) => void;
  reject: (reason: unknown) => void;
}

export interface RequestBatcher<K, V> {
  load: (key: K) => Promise<V>;
}

/**
 * Collapses keyed reads into small sequential batches. Entries exist only while
 * their promise is unresolved: this deduplicates mounts without caching data.
 */
export function createRequestBatcher<K, V>({
  loadBatch,
  windowMs = 8,
  maxBatchSize = 50,
}: RequestBatcherOptions<K, V>): RequestBatcher<K, V> {
  if (maxBatchSize < 1) throw new Error("maxBatchSize must be positive");

  const requests = new Map<K, PendingRequest<V>>();
  const queue: K[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flushing = false;

  const schedule = () => {
    if (timer !== undefined || flushing || queue.length === 0) return;
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, windowMs);
  };

  const flush = async () => {
    if (flushing) return;
    flushing = true;
    try {
      while (queue.length > 0) {
        const keys = queue.splice(0, maxBatchSize);
        try {
          const results = await loadBatch(keys);
          for (const key of keys) {
            const request = requests.get(key);
            if (!request) continue;
            if (results.has(key)) {
              request.resolve(results.get(key) as V);
            } else {
              request.reject(new Error(`Batch response omitted key: ${String(key)}`));
            }
            requests.delete(key);
          }
        } catch (error) {
          for (const key of keys) {
            requests.get(key)?.reject(error);
            requests.delete(key);
          }
        }
      }
    } finally {
      flushing = false;
      schedule();
    }
  };

  const load = (key: K): Promise<V> => {
    const existing = requests.get(key);
    if (existing) return existing.promise;

    let resolve!: (value: V) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<V>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    requests.set(key, { promise, resolve, reject });
    queue.push(key);
    schedule();
    return promise;
  };

  return { load };
}
