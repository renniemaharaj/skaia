import { render, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { describe, expect, it } from "vitest";
import SiteHead from "./SiteHead";

const branding = {
  site_name: "Example",
  tagline: "",
  logo_url: "",
  favicon_url: "",
  header_title: "Example",
  header_subtitle: "",
  header_variant: 1,
  menu_variant: 1,
};

const seo = {
  title: "",
  description: "Example site",
  og_image: "",
  dom_skin: "",
  dom_video: "",
  particle_style: "none",
  font_family: "Playfair Display",
};

describe("SiteHead", () => {
  it("loads and applies a validated site Google Font", async () => {
    render(
      <HelmetProvider>
        <SiteHead branding={branding} seo={seo} />
      </HelmetProvider>
    );

    await waitFor(() =>
      expect(document.head.querySelector('link[href*="fonts.googleapis.com"]')).toHaveAttribute(
        "href",
        "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&display=swap"
      )
    );
    expect(document.documentElement.style.getPropertyValue("--font-sans")).toContain(
      '"Playfair Display"'
    );
  });

  it("ignores an unsafe persisted font value", async () => {
    render(
      <HelmetProvider>
        <SiteHead branding={branding} seo={{ ...seo, font_family: 'Inter"; color: red' }} />
      </HelmetProvider>
    );

    await waitFor(() => expect(document.title).toBe("Example"));
    expect(document.head.innerHTML).not.toContain("color%3A+red");
    expect(document.documentElement.style.getPropertyValue("--font-sans")).toBe("");
  });
});
