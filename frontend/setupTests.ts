// setupTests.ts
// Extends Vitest's expect with jest-dom matchers for Testing Library assertions
import matchers from "@testing-library/jest-dom/matchers";
import { expect } from "vitest";

expect.extend(matchers);
