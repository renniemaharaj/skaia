import "./localStorage.mock";
import "@testing-library/jest-dom";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, vi } from "vitest";
type StorageMock = Storage & { _store: Record<string, string> };

const localStorageMock: StorageMock = {
  getItem: vi.fn(key => {
    return localStorageMock._store[key] || null;
  }),
  setItem: vi.fn((key, value) => {
    localStorageMock._store[key] = value.toString();
  }),
  removeItem: vi.fn(key => {
    delete localStorageMock._store[key];
  }),
  clear: vi.fn(() => {
    localStorageMock._store = {};
  }),
  key: vi.fn(index => {
    const keys = Object.keys(localStorageMock._store);
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
  value: vi.fn().mockImplementation(query => ({
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
