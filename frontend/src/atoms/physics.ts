import { atom } from "jotai";
import { type PhysicsSettings, defaultSettings } from "../components/ui/GravityParticles/engine";

export const physicsSettingsAtom = atom<PhysicsSettings>(defaultSettings);
