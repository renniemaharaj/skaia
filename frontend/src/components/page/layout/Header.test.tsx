import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider, createStore } from "jotai";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  accessTokenAtom,
  currentUserAtom,
  isAuthenticatedAtom,
  refreshTokenAtom,
} from "../../../atoms/auth";
import type { User } from "../../../atoms/auth";
import { brandingAtom } from "../../../atoms/config";
import { ThemeProvider } from "../../../hooks/theme/ThemeProvider";
import { Header } from "./Header";

// Helpers
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
  } = {}
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
            layoutMode="web"
            onToggleLayoutMode={() => {}}
          />
        </ThemeProvider>
      </Router>
    </Provider>
  );

  return { ...utils, store };
}

// Tests
describe("Header Component", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // Unauthenticated
  describe("Unauthenticated State", () => {
    it("renders sign-in button when not authenticated", () => {
      renderHeader();

      expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
    });

    it("does not render user menu when not authenticated", () => {
      renderHeader();

      expect(screen.queryByRole("button", { name: "Open account menu" })).not.toBeInTheDocument();
    });

    it("sign-in button is present for unauthenticated users", () => {
      renderHeader();

      const signInButton = screen.getByRole("button", { name: /sign in/i });
      expect(signInButton).toBeInTheDocument();
    });
  });

  // Authenticated
  describe("Authenticated State", () => {
    it("renders user display name when authenticated", () => {
      renderHeader({ authenticated: true });

      expect(screen.getByText("Test User")).toBeInTheDocument();
    });

    it("does not render sign-in button when authenticated", () => {
      renderHeader({ authenticated: true });

      expect(screen.queryByRole("button", { name: /sign in/i })).not.toBeInTheDocument();
    });

    it("falls back to username when display_name is empty", () => {
      renderHeader({
        authenticated: true,
        user: { ...testUser, display_name: "" },
      });

      expect(screen.getByText("testuser")).toBeInTheDocument();
    });

    it("shows sign out in the account glass menu", async () => {
      const user = userEvent.setup();
      renderHeader({ authenticated: true });

      await user.click(screen.getByRole("button", { name: "Open account menu" }));

      expect(screen.getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument();
    });

    it("clears auth state on logout", async () => {
      const user = userEvent.setup();
      // Suppress console.error from the expected fetch failure
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      const { store } = renderHeader({ authenticated: true });

      await user.click(screen.getByRole("button", { name: "Open account menu" }));
      const logoutButton = screen.getByRole("menuitem", { name: "Sign out" });
      await user.click(logoutButton);

      expect(store.get(isAuthenticatedAtom)).toBe(false);
      expect(store.get(currentUserAtom)).toBeNull();

      spy.mockRestore();
    });
  });

  // Navigation Links
  describe("Navigation Links", () => {
    it("renders all navigation links", async () => {
      const user = userEvent.setup();
      renderHeader();
      await user.click(screen.getByRole("button", { name: "Open drawer" }));

      expect(screen.getByRole("link", { name: /Home/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Store/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Forum/i })).toBeInTheDocument();
    });

    it("applies active class to current page link", async () => {
      const user = userEvent.setup();
      renderHeader({ route: "/store" });
      await user.click(screen.getByRole("button", { name: "Open drawer" }));

      const storeLink = screen.getByRole("link", { name: /Store/i });
      expect(storeLink).toHaveClass("active");
    });
  });

  // Cart Icon
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

  // Dark Mode Toggle
  describe("Dark Mode Toggle", () => {
    it("renders theme toggle button", () => {
      renderHeader();

      expect(screen.getByTitle("Toggle dark mode")).toBeInTheDocument();
    });
  });

  describe("Quick Actions Launcher", () => {
    it("opens its glass action grid on click", async () => {
      const user = userEvent.setup();
      renderHeader({ authenticated: true });

      const trigger = screen.getByRole("button", { name: "Open drawer" });
      expect(trigger).toHaveAttribute("aria-expanded", "false");

      await user.click(trigger);

      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByRole("dialog", { name: "App drawer" })).toBeInTheDocument();
      expect(screen.queryByText("Workspaces and tools")).not.toBeInTheDocument();
      expect(screen.getByText("Documentation")).toBeInTheDocument();
      expect(screen.getByTitle("Settings")).toBeInTheDocument();
    });

    it("closes the launcher with Escape", async () => {
      const user = userEvent.setup();
      renderHeader();

      const trigger = screen.getByRole("button", { name: "Open drawer" });
      await user.click(trigger);
      await user.keyboard("{Escape}");

      expect(trigger).toHaveAttribute("aria-expanded", "false");
    });

    it("lets home managers customize animation, tile size, labels, and grid layout", async () => {
      const user = userEvent.setup();
      renderHeader({
        authenticated: true,
        user: { ...testUser, permissions: ["home.manage"] },
      });

      await user.click(screen.getByRole("button", { name: "Open drawer" }));

      const search = screen.getByRole("searchbox", { name: "Search drawer" });
      const customize = screen.getByRole("button", { name: "Customize drawer" });
      expect(search.closest(".drawer-search-row")).toContainElement(customize);
      await user.click(customize);

      const animationSelect = screen.getByRole("button", { name: "Animation" });
      expect(animationSelect).toHaveClass("sk-select__trigger");
      expect(screen.getByRole("button", { name: "Tile size" })).toHaveClass("sk-select__trigger");
      expect(screen.getByRole("button", { name: "Grid" })).toHaveClass("sk-select__trigger");
      expect(screen.getByRole("button", { name: "Labels" })).toHaveClass("sk-select__trigger");
      expect(screen.getByRole("checkbox", { name: "Home" })).toBeChecked();

      await user.click(animationSelect);
      expect(screen.getByRole("menu")).toBeInTheDocument();
      expect(screen.getByRole("menuitem", { name: "Slide" })).toBeInTheDocument();
    });

    it("opens tool details inside the drawer and supports back navigation", async () => {
      const user = userEvent.setup();
      renderHeader({ authenticated: true });

      await user.click(screen.getByRole("button", { name: "Open drawer" }));
      await user.click(screen.getByRole("button", { name: "Sound controls" }));

      expect(screen.getByText("Sound", { selector: ".drawer-detail-header span" })).toBeVisible();
      expect(screen.getByRole("slider", { name: "Sound volume" })).toBeInTheDocument();
      expect(screen.queryByRole("searchbox", { name: "Search drawer" })).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Back to drawer" }));

      expect(screen.getByRole("searchbox", { name: "Search drawer" })).toBeInTheDocument();
      expect(screen.queryByRole("slider", { name: "Sound volume" })).not.toBeInTheDocument();
    });

    it("opens and advances immediately with Alt+ArrowRight", async () => {
      const user = userEvent.setup();
      renderHeader({ authenticated: true });

      const trigger = screen.getByRole("button", { name: "Open drawer" });
      await user.keyboard("{Alt>}{ArrowRight}{/Alt}");

      expect(trigger).toHaveAttribute("aria-expanded", "true");
      await waitFor(() => expect(screen.getByRole("link", { name: "Home" })).toHaveFocus());

      await user.keyboard("{ArrowDown}");
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Toggle dark mode" })).toHaveFocus()
      );

      await user.keyboard("{ArrowUp}");
      await waitFor(() => expect(screen.getByRole("link", { name: "Home" })).toHaveFocus());

      await user.keyboard("{ArrowRight}");
      await waitFor(() => expect(screen.getByRole("link", { name: "Store" })).toHaveFocus());

      await user.keyboard("{ArrowLeft}");
      await waitFor(() => expect(screen.getByRole("link", { name: "Home" })).toHaveFocus());
    });

    it("opens and decrements immediately with Alt+ArrowLeft", async () => {
      const user = userEvent.setup();
      renderHeader({ authenticated: true });

      await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");

      await waitFor(() => expect(screen.getByRole("link", { name: "Settings" })).toHaveFocus());
    });

    it("opens directly in tools with Alt+ArrowDown", async () => {
      const user = userEvent.setup();
      renderHeader({ authenticated: true });

      await user.keyboard("{Alt>}{ArrowDown}{/Alt}");

      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Toggle dark mode" })).toHaveFocus()
      );
    });
  });

  describe("Mobile Header", () => {
    it("does not render the legacy hamburger menu", () => {
      renderHeader();

      expect(
        screen.queryByRole("button", { name: /open menu|close menu/i })
      ).not.toBeInTheDocument();
    });
  });

  // Logo and Branding
  describe("Logo and Branding", () => {
    it("renders logo link to home", () => {
      renderHeader();

      const logoLink = screen.getByRole("link", { name: /CUEBALLCRAFT/i });
      expect(logoLink).toBeInTheDocument();
      expect(logoLink).toHaveAttribute("href", "/");
    });

    it("displays logo image", () => {
      renderHeader();

      const logoImage = screen.getByAltText(/Cueballcraft Skaiacraft/i) as HTMLImageElement;
      expect(logoImage).toBeInTheDocument();
      expect(logoImage.src).toContain("logo.png");
    });
  });

  // Responsive Behavior
  describe("Responsive Behavior", () => {
    it("renders header element", () => {
      renderHeader();

      expect(screen.getByRole("banner")).toBeInTheDocument();
    });

    it("maintains functionality with high cart count", () => {
      renderHeader({ cartCount: 99 });

      expect(screen.getByText("99")).toBeInTheDocument();
    });
  });
});
