import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import { Provider, createStore } from "jotai";
import { Header } from "./Header";
import { ThemeProvider } from "../../hooks/theme/ThemeProvider";
import {
  currentUserAtom,
  isAuthenticatedAtom,
  accessTokenAtom,
  refreshTokenAtom,
} from "../../atoms/auth";
import { brandingAtom } from "../../atoms/config";
import type { User } from "../../atoms/auth";

// ── Helpers ──────────────────────────────────────────────────────────────────

const testUser: User = {
  id: "123",
  username: "testuser",
  email: "test@example.com",
  display_name: "Test User",
  avatar_url: "",
  banner_url: "",
  photo_url: "",
  bio: "",
  is_suspended: false,
  roles: [],
  permissions: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

/** Create a fresh Jotai store. Optionally pre-populate for authenticated tests. */
function makeStore(opts?: { authenticated?: boolean; user?: User }) {
  const store = createStore();
  if (opts?.authenticated) {
    store.set(isAuthenticatedAtom, true);
    store.set(currentUserAtom, opts.user ?? testUser);
    store.set(accessTokenAtom, "test-jwt-token");
    store.set(refreshTokenAtom, "test-refresh-token");
  }

  store.set(brandingAtom, {
    site_name: "CUEBALLCRAFT",
    tagline: "",
    logo_url: "/logo.png",
    favicon_url: "",
    header_title: "Cueballcraft Skaiacraft",
    header_subtitle: "",
    header_variant: 1,
    menu_variant: 1,
  });

  return store;
}

/**
 * Render Header with all required providers.
 * Returns the Jotai store so tests can inspect atom values.
 */
function renderHeader(
  opts: {
    authenticated?: boolean;
    user?: User;
    cartCount?: number;
    isDarkMode?: boolean;
    route?: string;
  } = {},
) {
  const store = makeStore({
    authenticated: opts.authenticated,
    user: opts.user,
  });

  const Router = opts.route ? MemoryRouter : BrowserRouter;
  const routerProps = opts.route ? { initialEntries: [opts.route] } : undefined;

  const utils = render(
    <Provider store={store}>
      <Router {...(routerProps as any)}>
        <ThemeProvider>
          <Header
            cartCount={opts.cartCount ?? 0}
            isDarkMode={opts.isDarkMode ?? false}
            onDarkModeToggle={() => {}}
          />
        </ThemeProvider>
      </Router>
    </Provider>,
  );

  return { ...utils, store };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Header Component", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ── Unauthenticated ────────────────────────────────────────────────────

  describe("Unauthenticated State", () => {
    it("renders sign-in button when not authenticated", () => {
      renderHeader();

      expect(
        screen.getByRole("button", { name: /sign in/i }),
      ).toBeInTheDocument();
    });

    it("does not render user menu when not authenticated", () => {
      renderHeader();

      expect(screen.queryByTitle("Logout")).not.toBeInTheDocument();
    });

    it("sign-in button is present for unauthenticated users", () => {
      renderHeader();

      const signInButton = screen.getByRole("button", { name: /sign in/i });
      expect(signInButton).toBeInTheDocument();
    });
  });

  // ── Authenticated ──────────────────────────────────────────────────────

  describe("Authenticated State", () => {
    it("renders user display name when authenticated", () => {
      renderHeader({ authenticated: true });

      expect(screen.getByText("Test User")).toBeInTheDocument();
    });

    it("does not render sign-in button when authenticated", () => {
      renderHeader({ authenticated: true });

      expect(
        screen.queryByRole("button", { name: /sign in/i }),
      ).not.toBeInTheDocument();
    });

    it("falls back to username when display_name is empty", () => {
      renderHeader({
        authenticated: true,
        user: { ...testUser, display_name: "" },
      });

      expect(screen.getByText("testuser")).toBeInTheDocument();
    });

    it("shows logout button when authenticated", () => {
      renderHeader({ authenticated: true });

      expect(screen.getByTitle("Logout")).toBeInTheDocument();
    });

    it("clears auth state on logout", async () => {
      const user = userEvent.setup();
      // Suppress console.error from the expected fetch failure
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      const { store } = renderHeader({ authenticated: true });

      const logoutButton = screen.getByTitle("Logout");
      await user.click(logoutButton);

      expect(store.get(isAuthenticatedAtom)).toBe(false);
      expect(store.get(currentUserAtom)).toBeNull();

      spy.mockRestore();
    });
  });

  // ── Navigation Links ──────────────────────────────────────────────────

  describe("Navigation Links", () => {
    it("renders all navigation links", () => {
      renderHeader();

      expect(screen.getByRole("link", { name: /Home/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Store/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Forum/i })).toBeInTheDocument();
    });

    it("applies active class to current page link", () => {
      renderHeader({ route: "/store" });

      const storeLink = screen.getByRole("link", { name: /Store/i });
      expect(storeLink).toHaveClass("active");
    });
  });

  // ── Cart Icon ──────────────────────────────────────────────────────────

  describe("Cart Icon", () => {
    it("displays cart count badge when cart has items", () => {
      renderHeader({ cartCount: 5 });

      expect(screen.getByText("5")).toBeInTheDocument();
    });

    it("does not display cart count badge when cart is empty", () => {
      const { container } = renderHeader({ cartCount: 0 });

      const cartBadges = container.querySelectorAll(".cart-count");
      expect(cartBadges.length).toBe(0);
    });

    it("renders cart icon with title", () => {
      renderHeader({ cartCount: 3 });

      expect(screen.getByTitle("Shopping Cart")).toBeInTheDocument();
    });
  });

  // ── Dark Mode Toggle ──────────────────────────────────────────────────

  describe("Dark Mode Toggle", () => {
    it("renders theme toggle button", () => {
      renderHeader();

      expect(screen.getByTitle("Toggle dark mode")).toBeInTheDocument();
    });
  });

  // ── Mobile Menu ────────────────────────────────────────────────────────

  describe("Mobile Menu", () => {
    it("renders menu toggle button", () => {
      const { container } = renderHeader();

      const menuToggle = container.querySelector(".menu-toggle");
      expect(menuToggle).toBeInTheDocument();
    });

    it("toggles menu visibility", async () => {
      const user = userEvent.setup();
      const { container } = renderHeader();

      const menuToggle = container.querySelector(".menu-toggle")!;
      await user.click(menuToggle);

      const nav = container.querySelector(".nav");
      expect(nav).toHaveClass("open");
    });

    it("closes menu when clicking navigation link", async () => {
      const user = userEvent.setup();
      const { container } = renderHeader();

      // Open menu
      const menuToggle = container.querySelector(".menu-toggle")!;
      await user.click(menuToggle);
      expect(container.querySelector(".nav")).toHaveClass("open");

      // Click a nav link
      const homeLink = screen.getByRole("link", { name: /Home/i });
      await user.click(homeLink);

      expect(container.querySelector(".nav")).not.toHaveClass("open");
    });
  });

  // ── Logo and Branding ─────────────────────────────────────────────────

  describe("Logo and Branding", () => {
    it("renders logo link to home", () => {
      renderHeader();

      const logoLink = screen.getByRole("link", { name: /CUEBALLCRAFT/i });
      expect(logoLink).toBeInTheDocument();
      expect(logoLink).toHaveAttribute("href", "/");
    });

    it("displays logo image", () => {
      renderHeader();

      const logoImage = screen.getByAltText(
        /Cueballcraft Skaiacraft/i,
      ) as HTMLImageElement;
      expect(logoImage).toBeInTheDocument();
      expect(logoImage.src).toContain("logo.png");
    });
  });

  // ── Responsive Behavior ───────────────────────────────────────────────

  describe("Responsive Behavior", () => {
    it("renders header element", () => {
      const { container } = renderHeader();

      const header = container.querySelector(".header");
      expect(header).toBeInTheDocument();
    });

    it("maintains functionality with high cart count", () => {
      renderHeader({ cartCount: 99 });

      expect(screen.getByText("99")).toBeInTheDocument();
    });
  });
});
