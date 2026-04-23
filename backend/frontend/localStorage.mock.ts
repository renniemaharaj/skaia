// localStorage.mock.ts
// This must be imported before any code that uses localStorage at module scope
import { vi } from "vitest";

const localStorageMock: Storage = {
  getItem: vi.fn((key) => {
    return (localStorageMock as any)._store[key] || null;
  }),
  setItem: vi.fn((key, value) => {
    (localStorageMock as any)._store[key] = value.toString();
  }),
  removeItem: vi.fn((key) => {
    delete (localStorageMock as any)._store[key];
  }),
  clear: vi.fn(() => {
    (localStorageMock as any)._store = {};
  }),
  key: vi.fn((index) => {
    const keys = Object.keys((localStorageMock as any)._store);
    return keys[index] || null;
  }),
  length: 0,
  _store: {} as Record<string, string>,
};

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  writable: true,
});
