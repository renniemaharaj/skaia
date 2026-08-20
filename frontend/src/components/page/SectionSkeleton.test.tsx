import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SectionSkeleton, sectionSkeletonHeight } from "./SectionSkeleton";
import { type PageSection, SECTION_TYPES } from "./types";

function fixture(section_type: string, items = 0): PageSection {
  return {
    id: section_type,
    display_order: 1,
    section_type,
    heading: section_type,
    subheading: "",
    config: "{}",
    items: Array.from({ length: items }, (_, index) => ({ id: index })) as never[],
  };
}

describe("SectionSkeleton", () => {
  it("reserves distinct geometry for media, collections, rich, data, and interactive families", () => {
    expect(sectionSkeletonHeight(fixture("hero"))).toBe(500);
    expect(sectionSkeletonHeight(fixture("card_group", 6))).toBe(560);
    expect(sectionSkeletonHeight(fixture("rich_text"))).toBe(280);
    expect(sectionSkeletonHeight(fixture("data_sources"))).toBe(300);
    expect(sectionSkeletonHeight(fixture("form"))).toBe(254);
    expect(sectionSkeletonHeight(fixture("unknown"))).toBe(160);
  });

  it("uses bounded document counts and ignores invented hero geometry", () => {
    const hero = fixture("hero");
    hero.config = { minHeight: 9000 };
    expect(sectionSkeletonHeight(hero)).toBe(500);
    const form = fixture("form");
    form.config = JSON.stringify({ fields: Array.from({ length: 5 }, () => ({})) });
    expect(sectionSkeletonHeight(form)).toBe(382);
    form.config = "not json";
    expect(sectionSkeletonHeight(form)).toBe(254);
  });

  it("covers every canonical section type with bounded non-zero geometry", () => {
    for (const type of SECTION_TYPES) {
      expect(sectionSkeletonHeight(fixture(type))).toBeGreaterThanOrEqual(40);
      expect(sectionSkeletonHeight(fixture(type))).toBeLessThanOrEqual(880);
    }
  });

  it("restores the full-bleed hero silhouette without fake card media", () => {
    const { container } = render(<SectionSkeleton section={fixture("hero")} />);
    const hero = container.querySelector('[data-skeleton-kind="hero"]');
    expect(hero).toHaveClass("skeleton-pb-hero");
    expect(
      hero?.querySelectorAll(".section-skeleton__hero-copy .skeleton-ui__primitive")
    ).toHaveLength(2);
    expect(hero?.querySelector(".skeleton-ui__primitive--media")).not.toBeInTheDocument();
  });

  it("matches collection anatomy instead of applying media to every card", () => {
    const { container, rerender } = render(<SectionSkeleton section={fixture("card_group", 2)} />);
    expect(container.querySelectorAll(".section-skeleton__collection-item")).toHaveLength(2);
    expect(container.querySelector(".skeleton-ui__primitive--media")).not.toBeInTheDocument();

    rerender(<SectionSkeleton section={fixture("event_highlights", 2)} />);
    expect(container.querySelectorAll(".section-skeleton__event-media")).toHaveLength(2);

    rerender(<SectionSkeleton section={fixture("stat_cards", 2)} />);
    expect(container.querySelectorAll(".skeleton-ui__primitive--avatar")).toHaveLength(2);
  });

  it("matches CTA, rich-text, and profile renderer hierarchy", () => {
    const { container, rerender } = render(<SectionSkeleton section={fixture("cta")} />);
    expect(sectionSkeletonHeight(fixture("cta"))).toBe(260);
    expect(
      container.querySelectorAll('[data-skeleton-kind="cta"] > .skeleton-ui__primitive')
    ).toHaveLength(2);
    expect(container.querySelector(".section-skeleton__actions")).not.toBeInTheDocument();

    rerender(<SectionSkeleton section={fixture("rich_text")} />);
    expect(
      container.querySelector('[data-skeleton-kind="rich-text"] > .skeleton-ui__primitive')
    ).not.toBeInTheDocument();
    expect(
      container.querySelectorAll('[data-skeleton-kind="rich-text"] .skeleton-ui__primitive--text')
    ).toHaveLength(7);

    const profile = fixture("profile_card");
    profile.config = JSON.stringify({ checklist: ["One", "Two"], links: [{}, {}] });
    rerender(<SectionSkeleton section={profile} />);
    expect(
      container.querySelector("[data-skeleton-kind='profile'] > .section-skeleton__heading")
    ).toBeInTheDocument();
    expect(container.querySelectorAll(".section-skeleton__profile-list-item")).toHaveLength(2);
    expect(container.querySelectorAll(".section-skeleton__profile-links > *")).toHaveLength(2);
  });

  it("does not invent social icons for an empty links section", () => {
    const empty = fixture("social_links");
    const { container, rerender } = render(<SectionSkeleton section={empty} />);
    expect(sectionSkeletonHeight(empty)).toBe(40);
    expect(container.querySelector('[data-skeleton-kind="social"]')).toHaveAttribute(
      "data-empty",
      "true"
    );
    expect(container.querySelectorAll('[data-skeleton-kind="social"] > *')).toHaveLength(0);

    empty.config = JSON.stringify({ links: [{}, {}, {}] });
    rerender(<SectionSkeleton section={empty} />);
    expect(container.querySelectorAll('[data-skeleton-kind="social"] > *')).toHaveLength(3);
  });

  it("leaves announcements to the owning frame and hides decorative geometry", () => {
    const { container } = render(<SectionSkeleton section={fixture("image_gallery", 4)} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(container.querySelector(".section-skeleton-reserve")).toHaveStyle({
      minHeight: "880px",
    });
    expect(container.querySelectorAll(".section-skeleton__gallery-media")).toHaveLength(4);
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});
