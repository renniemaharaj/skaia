import { useCallback, useState } from "react";
import { toast } from "sonner";
import { apiRequest } from "../utils/api";

interface HomepageCandidate {
  id: number;
  slug: string;
  title?: string;
}

export function useSetHomepage(
  landingPageSlug: string,
  setLandingPageSlug: (slug: string) => void
) {
  const [settingHomepageId, setSettingHomepageId] = useState<number | null>(null);

  const handleSetHomepage = useCallback(
    async (page: HomepageCandidate) => {
      if (!page.id || page.slug === landingPageSlug) return;
      setSettingHomepageId(page.id);
      try {
        await apiRequest(`/pages/${page.id}/set-homepage`, { method: "POST" });
        setLandingPageSlug(page.slug);
        toast.success(`Set "${page.title || page.slug}" as homepage`);
      } catch {
        toast.error("Failed to set homepage");
      } finally {
        setSettingHomepageId(null);
      }
    },
    [landingPageSlug]
  );

  return { handleSetHomepage, settingHomepageId };
}
