import type { PageBuilderDoc } from "../../hooks/usePageData";
import { apiRequest } from "../../utils/api";
import { adaptLegacyPageSection } from "./sectionAdapter";
import type { PageSection } from "./types";

export interface TypedSectionState {
  id: number;
  legacy_key: string | number;
  revision: number;
  display_order: number;
}

export interface TypedSectionMutationResponse {
  page: PageBuilderDoc;
  sections: TypedSectionState[];
}

export function typedLegacyKey(value: string | number): string {
  return `${typeof value}:${String(value)}`;
}

export function typedSectionMap(sections: TypedSectionState[]): Map<string, TypedSectionState> {
  return new Map(sections.map(section => [typedLegacyKey(section.legacy_key), section]));
}

export function typedSectionPayload(section: PageSection) {
  const adapted = adaptLegacyPageSection({ ...section });
  if (adapted.status !== "normalized") {
    throw new Error("This section cannot be saved through the typed API");
  }
  const normalized = adapted.section;
  return {
    legacy_key: normalized.legacy_key,
    display_order: normalized.display_order,
    section_type: normalized.section_type,
    heading: normalized.heading,
    subheading: normalized.subheading,
    shell_version: normalized.shell_version,
    shell: normalized.shell,
    config_version: normalized.config_version,
    config: normalized.config,
    items: normalized.items.map(item => ({
      legacy_key: item.legacy_key,
      display_order: item.display_order,
      icon: item.icon,
      heading: item.heading,
      subheading: item.subheading,
      image_url: item.image_url,
      link_url: item.link_url,
      config_version: item.config_version,
      config: item.config,
    })),
  };
}

export async function loadTypedSections(pageId: number): Promise<TypedSectionState[]> {
  const response = await apiRequest<{ sections: TypedSectionState[] }>(`/pages/${pageId}/sections`);
  return response.sections ?? [];
}

export async function createTypedSection(
  pageId: number,
  section: PageSection
): Promise<TypedSectionMutationResponse> {
  return apiRequest(`/pages/${pageId}/sections`, {
    method: "POST",
    body: JSON.stringify({ section: typedSectionPayload(section) }),
  });
}

export async function updateTypedSection(
  pageId: number,
  state: TypedSectionState,
  section: PageSection
): Promise<TypedSectionMutationResponse> {
  return apiRequest(`/pages/${pageId}/sections/${state.id}`, {
    method: "PUT",
    body: JSON.stringify({
      expected_revision: state.revision,
      section: typedSectionPayload(section),
    }),
  });
}

export async function deleteTypedSection(
  pageId: number,
  state: TypedSectionState
): Promise<TypedSectionMutationResponse> {
  return apiRequest(`/pages/${pageId}/sections/${state.id}`, {
    method: "DELETE",
    body: JSON.stringify({ expected_revision: state.revision }),
  });
}

export async function reorderTypedSections(
  pageId: number,
  sections: PageSection[],
  states: Map<string, TypedSectionState>
): Promise<TypedSectionMutationResponse> {
  return apiRequest(`/pages/${pageId}/sections/reorder`, {
    method: "PUT",
    body: JSON.stringify({
      sections: sections.map(section => {
        const state = states.get(typedLegacyKey(section.id));
        if (!state) throw new Error("Section revision state is unavailable");
        return { id: state.id, expected_revision: state.revision };
      }),
    }),
  });
}
