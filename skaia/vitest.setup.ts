import "@testing-library/jest-dom";
import { expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// Setup localStorage mock
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

// Cleanup after each test
afterEach(() => {
  cleanup();
  localStorageMock.clear();
});

// Mock window.matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
