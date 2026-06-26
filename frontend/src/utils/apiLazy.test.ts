import { afterEach, describe, expect, it, vi } from "vitest";

import { apiRequestLazy } from "./api";

interface Item {
  id: string;
  value: string;
}

describe("apiRequestLazy", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("collapses HTTP reads and resolves callers individually without caching", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const { ids } = JSON.parse(String(init?.body)) as { ids: string[] };
      return new Response(
        JSON.stringify({ items: ids.map(id => ({ id, value: `value-${id}` })) }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const requestItem = apiRequestLazy<string, Item, { items: Item[] }>("/items/batch", {
      windowMs: 5,
      maxBatchSize: 10,
      buildBody: ids => ({ ids }),
      selectItems: response => response.items,
      keyOf: item => item.id,
    });

    const first = requestItem("1");
    const duplicate = requestItem("1");
    const second = requestItem("2");
    expect(first).toBe(duplicate);
    await vi.advanceTimersByTimeAsync(5);

    await expect(Promise.all([first, second])).resolves.toEqual([
      { id: "1", value: "value-1" },
      { id: "2", value: "value-2" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ ids: ["1", "2"] });

    const fresh = requestItem("1");
    await vi.advanceTimersByTimeAsync(5);
    await fresh;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
