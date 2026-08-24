import { useMemo } from "react";
import { InteractiveSectionBlock } from "./blocks/InteractiveSectionBlock";
import type { InteractiveSubmissionBinding } from "./blocks/InteractiveSectionBlock";
import type { InteractiveConfig, InteractiveSectionType } from "./interactiveTypes";
import type { PageSection } from "./types";

const noop = () => {};

interface InteractiveActionSectionProps {
  id: string;
  type: InteractiveSectionType;
  heading: string;
  description?: string;
  config: InteractiveConfig;
  submission: InteractiveSubmissionBinding;
}

/**
 * Projects a domain-owned action through the shared interactive-section UI.
 * The binding performs the authoritative mutation; this adapter never stores a
 * second response record in pages.content.
 */
export function InteractiveActionSection({
  id,
  type,
  heading,
  description = "",
  config,
  submission,
}: InteractiveActionSectionProps) {
  const section = useMemo<PageSection>(
    () => ({
      id,
      display_order: 1,
      section_type: type,
      heading,
      subheading: description,
      config: JSON.stringify(config),
      items: [],
    }),
    [config, description, heading, id, type]
  );

  return (
    <InteractiveSectionBlock
      section={section}
      canEdit={false}
      onUpdate={noop}
      onDelete={noop}
      submission={submission}
      presentation="action"
    />
  );
}
