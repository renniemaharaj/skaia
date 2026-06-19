import { describe, expect, it, vi } from "vitest";

import { createRequestBatcher } from "./requestBatcher";

describe("createRequestBatcher", () => {
  it("deduplicates a key and batches unique keys", async () => {
    vi.useFakeTimers();
    const loadBatch = vi.fn(
      async (keys: string[]) => new Map(keys.map(key => [key, `user-${key}`]))
    );
    const batcher = createRequestBatcher({ loadBatch, windowMs: 10 });

    const first = batcher.load("1");
    const duplicate = batcher.load("1");
    const second = batcher.load("2");
    expect(first).toBe(duplicate);

    await vi.advanceTimersByTimeAsync(10);
    await expect(Promise.all([first, duplicate, second])).resolves.toEqual([
      "user-1",
      "user-1",
      "user-2",
    ]);
    expect(loadBatch).toHaveBeenCalledWith(["1", "2"]);
    vi.useRealTimers();
  });

  it("caps batches and does not retain resolved values", async () => {
    vi.useFakeTimers();
    const loadBatch = vi.fn(async (keys: string[]) => new Map(keys.map(key => [key, key])));
    const batcher = createRequestBatcher({ loadBatch, windowMs: 5, maxBatchSize: 2 });

    const initial = [batcher.load("1"), batcher.load("2"), batcher.load("3")];
    await vi.advanceTimersByTimeAsync(5);
    await Promise.all(initial);
    expect(loadBatch.mock.calls.map(call => call[0])).toEqual([["1", "2"], ["3"]]);

    const fresh = batcher.load("1");
    await vi.advanceTimersByTimeAsync(5);
    await fresh;
    expect(loadBatch).toHaveBeenLastCalledWith(["1"]);
    vi.useRealTimers();
  });

  it("rejects only keys omitted by the batch response", async () => {
    vi.useFakeTimers();
    const batcher = createRequestBatcher<string, string>({
      windowMs: 1,
      loadBatch: async () => new Map([["1", "one"]]),
    });

    const present = batcher.load("1");
    const missing = batcher.load("2");
    const missingExpectation = expect(missing).rejects.toThrow("Batch response omitted key: 2");
    await vi.advanceTimersByTimeAsync(1);
    await expect(present).resolves.toBe("one");
    await missingExpectation;
    vi.useRealTimers();
  });
});
