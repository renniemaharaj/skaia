import { apiRequest } from "../../utils/api";
import type { BibleBook, BibleCatalog } from "./types";

const MAX_BOOK_CACHE_SIZE = 8;
const bookCache = new Map<string, BibleBook>();
const pendingBooks = new Map<string, Promise<BibleBook>>();
let catalogPromise: Promise<BibleCatalog> | null = null;

export function fetchBibleCatalog(): Promise<BibleCatalog> {
  if (!catalogPromise) {
    catalogPromise = apiRequest<BibleCatalog>("/bible/kjv/books").catch(error => {
      catalogPromise = null;
      throw error;
    });
  }
  return catalogPromise;
}

function rememberBook(book: BibleBook) {
  bookCache.delete(book.slug);
  bookCache.set(book.slug, book);
  while (bookCache.size > MAX_BOOK_CACHE_SIZE) {
    const oldest = bookCache.keys().next().value;
    if (typeof oldest !== "string") break;
    bookCache.delete(oldest);
  }
}

export function fetchBibleBook(book: string): Promise<BibleBook> {
  const key = book.trim().toLowerCase();
  const cached = bookCache.get(key);
  if (cached) {
    bookCache.delete(key);
    bookCache.set(key, cached);
    return Promise.resolve(cached);
  }

  const pending = pendingBooks.get(key);
  if (pending) return pending;

  const request = apiRequest<BibleBook>(`/bible/kjv/books/${encodeURIComponent(book)}`)
    .then(result => {
      rememberBook(result);
      return result;
    })
    .finally(() => pendingBooks.delete(key));
  pendingBooks.set(key, request);
  return request;
}

export function clearBibleCacheForTests() {
  bookCache.clear();
  pendingBooks.clear();
  catalogPromise = null;
}
