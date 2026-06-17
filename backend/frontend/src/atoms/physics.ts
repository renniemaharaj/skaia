import { atom } from "jotai";
import { defaultSettings, type PhysicsSettings } from "../components/ui/GravityParticles/engine";

export const physicsSettingsAtom = atom<PhysicsSettings>(defaultSettings);
