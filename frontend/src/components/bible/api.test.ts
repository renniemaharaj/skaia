import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../utils/api";
import { clearBibleCacheForTests, fetchBibleBook, fetchBibleCatalog } from "./api";
import type { BibleBook, BibleCatalog } from "./types";

vi.mock("../../utils/api", () => ({
  apiRequest: vi.fn(),
}));

const apiRequestMock = vi.mocked(apiRequest);

describe("Bible API client cache", () => {
  beforeEach(() => {
    clearBibleCacheForTests();
    apiRequestMock.mockReset();
  });

  it("coalesces catalog and book reads and reuses the loaded book", async () => {
    const catalog = {
      translation: { code: "KJV" },
      books: [],
    } as unknown as BibleCatalog;
    const matthew: BibleBook = {
      translation: "KJV",
      title: "Matthew",
      slug: "matthew",
      chapters: { "1": { "1": "text" } },
      markers: {
        schema_version: 1,
        book: "Matthew",
        offset_unit: "Unicode code points",
        span_end: "exclusive",
        chapters: {},
      },
    };
    apiRequestMock.mockImplementation(endpoint =>
      Promise.resolve(endpoint.endsWith("/books") ? catalog : matthew)
    );

    const [catalogOne, catalogTwo] = await Promise.all([fetchBibleCatalog(), fetchBibleCatalog()]);
    expect(catalogOne).toBe(catalogTwo);
    expect(apiRequestMock).toHaveBeenCalledTimes(1);

    const [bookOne, bookTwo] = await Promise.all([
      fetchBibleBook("matthew"),
      fetchBibleBook("matthew"),
    ]);
    expect(bookOne).toBe(bookTwo);
    expect(await fetchBibleBook("matthew")).toBe(bookOne);
    expect(apiRequestMock).toHaveBeenCalledTimes(2);
  });

  it("clears rejected catalog and book requests so they can retry", async () => {
    apiRequestMock.mockRejectedValueOnce(new Error("offline"));
    await expect(fetchBibleCatalog()).rejects.toThrow("offline");
    apiRequestMock.mockResolvedValueOnce({
      translation: { code: "KJV" },
      books: [],
    } as unknown as BibleCatalog);
    await expect(fetchBibleCatalog()).resolves.toBeTruthy();

    apiRequestMock.mockRejectedValueOnce(new Error("missing"));
    await expect(fetchBibleBook("matthew")).rejects.toThrow("missing");
    apiRequestMock.mockResolvedValueOnce({
      translation: "KJV",
      title: "Matthew",
      slug: "matthew",
      chapters: {},
      markers: {
        schema_version: 1,
        book: "Matthew",
        offset_unit: "Unicode code points",
        span_end: "exclusive",
        chapters: {},
      },
    } satisfies BibleBook);
    await expect(fetchBibleBook("matthew")).resolves.toMatchObject({ slug: "matthew" });
  });
});
