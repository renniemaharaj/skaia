import { atom } from "jotai";

// Shared guest sandbox state for the frontend. This avoids DOM polling and
// allows multiple components to react to toggle state consistently.
export const guestSandboxAtom = atom(false);
