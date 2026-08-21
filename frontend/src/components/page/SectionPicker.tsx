import {
  BarChart3,
  Blocks,
  CalendarDays,
  ChevronDown,
  CircleDot,
  ClipboardList,
  ClipboardPaste,
  Code2,
  Database,
  FileQuestion,
  Files,
  FormInput,
  Image,
  Images,
  LayoutGrid,
  Link2,
  List,
  Megaphone,
  MousePointerClick,
  PanelsTopLeft,
  Plus,
  Share2,
  Sparkles,
  Star,
  Text,
  UserRound,
  Vote,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Button from "../input/Button";
import { FilterBar } from "../ui/FilterBar";
import {
  SECTION_TYPE_DESCRIPTIONS,
  SECTION_TYPE_GROUPS,
  SECTION_TYPE_LABELS,
  type SectionType,
} from "./types";

const GROUP_ICONS: Record<string, LucideIcon> = {
  featured: Star,
  content: Files,
  rich: PanelsTopLeft,
  interactive: MousePointerClick,
  embeds: Link2,
};

const SECTION_ICONS: Record<SectionType, LucideIcon> = {
  hero: Image,
  card_group: Blocks,
  stat_cards: BarChart3,
  social_links: Share2,
  image_gallery: Images,
  feature_grid: LayoutGrid,
  cta: Megaphone,
  event_highlights: CalendarDays,
  profile_card: UserRound,
  rich_text: Text,
  code_editor: Code2,
  data_sources: Database,
  derived_section: Workflow,
  custom_section: Sparkles,
  form: FormInput,
  qa: FileQuestion,
  survey: ClipboardList,
  poll: CircleDot,
  vote: Vote,
  resource_embed: Link2,
};

interface SectionPickerProps {
  clipboardLabel?: string;
  onClose: () => void;
  onPaste?: () => void;
  onSelect: (type: SectionType) => void;
}

export function SectionPicker({ clipboardLabel, onClose, onPaste, onSelect }: SectionPickerProps) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"list" | "grid">("list");
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set(["featured"]));
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const originRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
  );
  const titleID = useId();
  const descriptionID = useId();
  const instanceID = titleID.replaceAll(":", "");
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const filteredGroups = useMemo(
    () =>
      SECTION_TYPE_GROUPS.map(group => {
        const groupMatches = `${group.label} ${group.description}`
          .toLocaleLowerCase()
          .includes(normalizedQuery);
        const types = group.types.filter(type =>
          groupMatches
            ? true
            : `${SECTION_TYPE_LABELS[type]} ${SECTION_TYPE_DESCRIPTIONS[type]}`
                .toLocaleLowerCase()
                .includes(normalizedQuery)
        );
        return { ...group, types };
      }).filter(group => group.types.length > 0),
    [normalizedQuery]
  );

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      window.setTimeout(() => originRef.current?.focus(), 0);
    };
  }, []);

  const toggleGroup = (groupID: string) => {
    setOpenGroups(previous => {
      const next = new Set(previous);
      if (next.has(groupID)) next.delete(groupID);
      else next.add(groupID);
      return next;
    });
  };

  const renderSection = (type: SectionType) => {
    const Icon = SECTION_ICONS[type];
    const labelID = `section-picker-${type}-label-${instanceID}`;
    const itemDescriptionID = `section-picker-${type}-description-${instanceID}`;
    return (
      <Button
        unstyled
        className="pb-section-picker__item"
        key={type}
        onClick={() => onSelect(type)}
        aria-labelledby={labelID}
        aria-describedby={itemDescriptionID}
      >
        <span className="pb-section-picker__item-icon" aria-hidden="true">
          <Icon size={17} strokeWidth={1.9} />
        </span>
        <span className="pb-section-picker__item-copy">
          <strong id={labelID}>{SECTION_TYPE_LABELS[type]}</strong>
          <span id={itemDescriptionID}>{SECTION_TYPE_DESCRIPTIONS[type]}</span>
        </span>
        <span className="pb-section-picker__item-add" aria-hidden="true">
          <Plus size={15} />
        </span>
      </Button>
    );
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="ui-dialog-overlay pb-section-picker-overlay"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="ui-dialog pb-section-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleID}
        aria-describedby={descriptionID}
      >
        <header className="pb-section-picker__header">
          <div>
            <h2 id={titleID}>Add section</h2>
            <p id={descriptionID}>Choose a section type to add to your page.</p>
          </div>
          <Button
            variant="action"
            size="icon"
            className="pb-section-picker__close"
            onClick={onClose}
            aria-label="Close section picker"
          >
            <X size={16} />
          </Button>
        </header>

        <FilterBar
          compact
          className="pb-section-picker__tools"
          ariaLabel="Section picker controls"
          searchValue={query}
          onSearchChange={setQuery}
          searchPlaceholder="Search sections…"
          searchAriaLabel="Search sections"
          searchAutoFocus
        >
          <div
            className="pb-section-picker__view-toggle"
            role="group"
            aria-label="Section picker layout"
          >
            <Button
              unstyled
              className={`pb-section-picker__view-btn${view === "grid" ? " active" : ""}`}
              onClick={() => setView("grid")}
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              title="Grid view"
            >
              <LayoutGrid size={14} />
            </Button>
            <Button
              unstyled
              className={`pb-section-picker__view-btn${view === "list" ? " active" : ""}`}
              onClick={() => setView("list")}
              aria-label="List view"
              aria-pressed={view === "list"}
              title="List view"
            >
              <List size={14} />
            </Button>
          </div>
        </FilterBar>

        <div className="pb-section-picker__body">
          {clipboardLabel && onPaste && !normalizedQuery && (
            <Button unstyled className="pb-section-picker__paste" onClick={onPaste}>
              <span aria-hidden="true">
                <ClipboardPaste size={20} />
              </span>
              <span>
                <strong>Paste copied section</strong>
                <small>{clipboardLabel}</small>
              </span>
              <Plus size={17} aria-hidden="true" />
            </Button>
          )}

          {filteredGroups.length === 0 ? (
            <div className="pb-section-picker__empty" role="status">
              <SearchFieldEmptyIcon />
              <strong>No sections found</strong>
              <span>Try a different name or description.</span>
            </div>
          ) : view === "grid" ? (
            <div className="pb-section-picker__grid">
              {filteredGroups.flatMap(group => group.types.map(renderSection))}
            </div>
          ) : (
            <div className="pb-section-picker__groups">
              {filteredGroups.map(group => {
                const GroupIcon = GROUP_ICONS[group.id];
                const expanded = normalizedQuery !== "" || openGroups.has(group.id);
                const contentID = `section-picker-${group.id}-${instanceID}`;
                const groupLabelID = `${contentID}-label`;
                const groupDescriptionID = `${contentID}-description`;
                return (
                  <section
                    className="pb-section-picker__group"
                    data-group={group.id}
                    key={group.id}
                  >
                    <Button
                      unstyled
                      className="pb-section-picker__group-header"
                      onClick={() => toggleGroup(group.id)}
                      aria-expanded={expanded}
                      aria-controls={contentID}
                      aria-labelledby={groupLabelID}
                      aria-describedby={groupDescriptionID}
                    >
                      <span className="pb-section-picker__group-icon" aria-hidden="true">
                        <GroupIcon size={18} strokeWidth={1.9} />
                      </span>
                      <span className="pb-section-picker__group-copy">
                        <strong id={groupLabelID}>{group.label}</strong>
                        <span id={groupDescriptionID}>{group.description}</span>
                      </span>
                      <ChevronDown
                        className="pb-section-picker__chevron"
                        data-expanded={expanded}
                        size={16}
                        aria-hidden="true"
                      />
                    </Button>
                    {expanded && (
                      <div className="pb-section-picker__items" id={contentID}>
                        {group.types.map(renderSection)}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function SearchFieldEmptyIcon() {
  return <LayoutGrid size={25} aria-hidden="true" />;
}
