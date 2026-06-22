import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";

/**
 * A dictionary of layout preferences, keyed by a route or component name.
 * We persist this whole object to localStorage so that various toggles
 * (like table/grid views) across the app remember their last setting.
 */
export const layoutPositionsAtom = atomWithStorage<Record<string, string>>(
  "layoutPositions",
  {}
);

/**
 * A helper hook to get/set a specific layout position (e.g. viewMode).
 */
export const useLayoutPosition = <T extends string>(key: string, defaultValue: T) => {
  const [positions, setPositions] = useAtom(layoutPositionsAtom);
  
  const value = (positions[key] as T) || defaultValue;
  
  const setValue = (newValue: T) => {
    setPositions((prev) => ({
      ...prev,
      [key]: newValue,
    }));
  };
  
  return [value, setValue] as const;
};
