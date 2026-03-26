import { useEffect } from "react";
import { useAtom } from "jotai";
import { featuresAtom } from "../atoms/config";
import { apiRequest } from "../utils/api";

const defaultFeatures = {
  landing: true,
  store: true,
  forum: true,
  cart: true,
  users: true,
  inbox: true,
  presence: true,
};

export function useFeatures() {
  const [features, setFeatures] = useAtom(featuresAtom);

  useEffect(() => {
    const load = async () => {
      try {
        const remote = await apiRequest<string[] | Record<string, boolean>>(
          "/config/features",
        );

        const enabledSet = new Set<string>();
        if (Array.isArray(remote)) {
          (remote as string[]).forEach((f) => enabledSet.add(f));
        } else if (remote && typeof remote === "object") {
          Object.entries(remote as Record<string, boolean>).forEach(
            ([name, enabled]) => {
              if (enabled) enabledSet.add(name);
            },
          );
        }

        const mergedFeatures: Record<string, boolean> = {
          landing: false,
          store: false,
          forum: false,
          cart: false,
          users: false,
          inbox: false,
          presence: false,
        };

        Object.keys(mergedFeatures).forEach((name) => {
          mergedFeatures[name] = enabledSet.has(name);
        });

        setFeatures(mergedFeatures);
      } catch (error) {
        console.warn("useFeatures: failed to load features", error);
        setFeatures(defaultFeatures);
      }
    };

    load();
  }, [setFeatures]);

  return features;
}
