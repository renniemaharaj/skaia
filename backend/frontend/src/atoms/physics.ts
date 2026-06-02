import { atom } from "jotai";

export const physicsSettingsAtom = atom({
  gravityConstant: 0.08,
  maxVelocity: 10,
  explosionThreshold: 40,
  bounceRestitution: 0.5,
  orbitalDecayChance: 0.02,
  cursorMass: 150,
});
