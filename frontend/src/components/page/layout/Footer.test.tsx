import { render, screen, waitFor } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { brandingAtom, footerConfigAtom } from "../../../atoms/config";
import { apiRequest } from "../../../utils/api";
import type { FooterConfig } from "../types";
import { Footer } from "./Footer";

vi.mock("../../../utils/api", async importOriginal => {
  const actual = await importOriginal<typeof import("../../../utils/api")>();
  return { ...actual, apiRequest: vi.fn() };
});

const footer: FooterConfig = {
  variant: 1,
  site_title: "About",
  site_description: "Footer copy",
  community_heading: "Community",
  community_items: [],
  copyright_text: "Example",
  quick_links: [],
  contact_heading: "Contact",
  contact_text: "Contact us",
  tagline: "",
  social_links: [],
};

describe("Footer policies", () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset();
    vi.mocked(apiRequest).mockResolvedValue({
      policies: [
        {
          id: "privacy",
          name: "Privacy policy",
          page_slug: "legal-privacy-a1b2",
        },
      ],
      cookie_policy_ids: [],
      footer_policy_ids: ["privacy"],
      checkout_policy_ids: [],
    });
  });

  it.each([1, 2, 3, 4])(
    "shows client content, logo placement, and policy links in footer variant %s",
    async variant => {
      const store = createStore();
      store.set(footerConfigAtom, { ...footer, variant });
      store.set(brandingAtom, {
        site_name: "Client",
        tagline: "",
        logo_url: "/client-logo.png",
        favicon_url: "",
        header_title: "Client",
        header_subtitle: "",
        header_variant: 1,
        menu_variant: 1,
      });
      const { container } = render(
        <Provider store={store}>
          <MemoryRouter>
            <Footer />
          </MemoryRouter>
        </Provider>
      );

      await waitFor(() =>
        expect(screen.getByRole("navigation", { name: "Site policies" })).toBeInTheDocument()
      );
      expect(screen.getByRole("link", { name: "Privacy policy" })).toHaveAttribute(
        "href",
        "/page/legal-privacy-a1b2"
      );
      expect(screen.getByText("Footer copy")).toBeInTheDocument();
      expect(
        container.querySelector(`.footer-logo-background.footer-v${variant}-watermark`)
      ).toBeInTheDocument();
    }
  );

  it("does not substitute a static logo when the client has no configured logo", async () => {
    const store = createStore();
    store.set(footerConfigAtom, { ...footer, variant: 4 });
    store.set(brandingAtom, {
      site_name: "Client",
      tagline: "",
      logo_url: "",
      favicon_url: "",
      header_title: "Client",
      header_subtitle: "",
      header_variant: 1,
      menu_variant: 1,
    });
    const { container } = render(
      <Provider store={store}>
        <MemoryRouter>
          <Footer />
        </MemoryRouter>
      </Provider>
    );

    await waitFor(() =>
      expect(screen.getByRole("navigation", { name: "Site policies" })).toBeInTheDocument()
    );
    expect(container.querySelector(".footer-logo-background")).not.toBeInTheDocument();
  });
});
