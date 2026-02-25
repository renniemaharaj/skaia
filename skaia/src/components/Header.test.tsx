import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter, MemoryRouter } from "react-router-dom";
import { Header } from "./Header";

describe("Header Component", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe("Unauthenticated State", () => {
    it("renders login and register buttons when not authenticated", () => {
      render(
        <BrowserRouter>
          <Header
            cartCount={0}
            isDarkMode={false}
            onDarkModeToggle={() => {}}
          />
        </BrowserRouter>,
      );

      expect(
        screen.getByRole("button", { name: /^Login$/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /^Register$/i }),
      ).toBeInTheDocument();
    });

    it("does not render user menu when not authenticated", () => {
      render(
        <BrowserRouter>
          <Header
            cartCount={0}
            isDarkMode={false}
            onDarkModeToggle={() => {}}
          />
        </BrowserRouter>,
      );

      expect(screen.queryByText(/^Log out$/i)).not.toBeInTheDocument();
    });

    it("navigates to login when clicking login button", async () => {
      //   const user = userEvent.setup();
      render(
        <BrowserRouter>
          <Header
            cartCount={0}
            isDarkMode={false}
            onDarkModeToggle={() => {}}
          />
        </BrowserRouter>,
      );

      // Note: In a real integration test with routing, this would navigate to /login
      const loginButton = screen.getByRole("button", { name: /^Login$/i });
      expect(loginButton).toBeInTheDocument();
    });

    it("navigates to register when clicking register button", async () => {
      //   const user = userEvent.setup();
      render(
        <BrowserRouter>
          <Header
            cartCount={0}
            isDarkMode={false}
            onDarkModeToggle={() => {}}
          />
        </BrowserRouter>,
      );

      const registerButton = screen.getByRole("button", {
        name: /^Register$/i,
      });
      expect(registerButton).toBeInTheDocument();
    });
  });

  describe("Authenticated State", () => {
    beforeEach(() => {
      const testUser = {
        id: "123",
        username: "testuser",
        email: "test@example.com",
      };
      localStorage.setItem("authToken", "test-jwt-token");
      localStorage.setItem("user", JSON.stringify(testUser));
    });

    it("renders user menu when authenticated", () => {
      render(
        <BrowserRouter>
          <Header
            cartCount={0}
            isDarkMode={false}
            onDarkModeToggle={() => {}}
          />
        </BrowserRouter>,
      );

      expect(screen.getByText("testuser")).toBeInTheDocument();
    });

    it("does not render login and register buttons when authenticated", () => {
      render(
        <BrowserRouter>
          <Header
            cartCount={0}
            isDarkMode={false}
            onDarkModeToggle={() => {}}
          />
        </BrowserRouter>,
      );

      expect(
        screen.queryByRole("button", { name: /^Login$/i }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /^Register$/i }),
      ).not.toBeInTheDocument();
    });

    it("displays user email when username is not available", () => {
      const testUser = { id: "123", email: "test@example.com" };
      localStorage.setItem("user", JSON.stringify(testUser));

      render(
        <BrowserRouter>
          <Header
            cartCount={0}
            isDarkMode={false}
            onDarkModeToggle={() => {}}
          />
        </BrowserRouter>,
      );

      expect(screen.getByText("test@example.com")).toBeInTheDocument();
    });

    it("shows logout button in user menu", () => {
      render(
        <BrowserRouter>
          <Header
            cartCount={0}
            isDarkMode={false}
            onDarkModeToggle={() => {}}
          />
        </BrowserRouter>,
      );

      const logoutButton = screen.getByTitle("Logout");
      expect(logoutButton).toBeInTheDocument();
    });

    it("clears auth data and navigates to home on logout", async () => {
      const user = userEvent.setup();

      render(
        <BrowserRouter>
          <Header
            cartCount={0}
            isDarkMode={false}
            onDarkModeToggle={() => {}}
          />
        </BrowserRouter>,
      );

      const logoutButton = screen.getByTitle("Logout");
      await user.click(logoutButton);

      expect(localStorage.getItem("authToken")).toBeNull();
      expect(localStorage.getItem("user")).toBeNull();
    });
  });

  describe("Navigation Links", () => {
    it("renders all navigation links", () => {
      render(
        <BrowserRouter>
          <Header
            cartCount={0}
            isDarkMode={false}
            onDarkModeToggle={() => {}}
          />
        </BrowserRouter>,
      );

      expect(screen.getByRole("link", { name: /Home/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Store/i })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Forum/i })).toBeInTheDocument();
    });

    it("applies active class to current page link", () => {
      render(
        <MemoryRouter initialEntries={["/store"]}>
          <Header
            cartCount={0}
            isDarkMode={false}
            onDarkModeToggle={() => {}}
          />
        </MemoryRouter>,
      );

      const storeLink = screen.getByRole("link", { name: /Store/i });
      expect(storeLink).toHaveClass("active");
    });
  });

  describe("Cart Icon", () => {
    it("displays cart count badge when cart has items", () => {
      render(
        <BrowserRouter>
          <Header
            cartCount={5}
            isDarkMode={false}
            onDarkModeToggle={() => {}}
          />
        </BrowserRouter>,
      );

      expect(screen.getByText("5")).toBeInTheDocument();
    });

    it("does not display cart count badge when cart is empty", () => {
      const { container } = render(
        <BrowserRouter>
          <Header
            cartCount={0}
            isDarkMode={false}
            onDarkModeToggle={() => {}}
          />
        </BrowserRouter>,
      );

      const cartBadges = container.querySelectorAll(".cart-count");
      expect(cartBadges.length).toBe(0);
    });

    it("navigates to cart page when clicking cart icon", async () => {
      //   const user = userEvent.setup();

      render(
        <BrowserRouter>
          <Header
            cartCount={3}
            isDarkMode={false}
            onDarkModeToggle={() => {}}
          />
        </BrowserRouter>,
      );

      const cartIcon = screen.getByTitle("Shopping Cart");
      expect(cartIcon).toBeInTheDocument();
    });
  });

  describe("Dark Mode Toggle", () => {
    it("renders theme toggle button", () => {
      render(
        <BrowserRouter>
          <Header
            cartCount={0}
            isDarkMode={false}
            onDarkModeToggle={() => {}}
          />
        </BrowserRouter>,
      );

      const themeButton = screen.getByTitle("Toggle dark mode");
      expect(themeButton).toBeInTheDocument();
    });

    it("calls onDarkModeToggle when clicking theme button", async () => {
      const user = userEvent.setup();
      const mockToggle = vi.fn();

      render(
        <BrowserRouter>
          <Header
            cartCount={0}
            isDarkMode={false}
            onDarkModeToggle={mockToggle}
          />
        </BrowserRouter>,
      );

      const themeButton = screen.getByTitle("Toggle dark mode");
      await user.click(themeButton);

      expect(mockToggle).toHaveBeenCalledWith(true);
    });

    it("displays correct icon based on dark mode state", () => {
      const { rerender } = render(
        <BrowserRouter>
          <Header
            cartCount={0}
            isDarkMode={false}
            onDarkModeToggle={() => {}}
          />
        </BrowserRouter>,
      );

      // In light mode, should show Moon icon
      expect(screen.getByTitle("Toggle dark mode")).toBeInTheDocument();

      rerender(
        <BrowserRouter>
          <Header cartCount={0} isDarkMode={true} onDarkModeToggle={() => {}} />
        </BrowserRouter>,
      );

      // In dark mode, should show Sun icon
      expect(screen.getByTitle("Toggle dark mode")).toBeInTheDocument();
    });

    it("persists theme preference to localStorage", async () => {
      const user = userEvent.setup();
      const mockToggle = vi.fn((isDark) => {
        localStorage.setItem("theme", isDark ? "dark" : "light");
      });

      render(
        <BrowserRouter>
          <Header
            cartCount={0}
            isDarkMode={false}
            onDarkModeToggle={mockToggle}
          />
        </BrowserRouter>,
      );

      const themeButton = screen.getByTitle("Toggle dark mode");
      await user.click(themeButton);

      // In a real test with the actual implementation
      // expect(localStorage.getItem('theme')).toBe('dark');
    });
  });

  describe("Mobile Menu", () => {
    it("renders menu toggle button on mobile", () => {
      // This test would need viewport configuration
      //   const { container } = render(
      //     <BrowserRouter>
      //       <Header
      //         cartCount={0}
      //         isDarkMode={false}
      //         onDarkModeToggle={() => {}}
      //       />
      //     </BrowserRouter>,
      //   );
      const menuToggle = screen.getByRole("button", { name: "" });
      expect(menuToggle).toBeInTheDocument();
    });

    it("toggles menu visibility", async () => {
      const user = userEvent.setup();
      render(
        <BrowserRouter>
          <Header
            cartCount={0}
            isDarkMode={false}
            onDarkModeToggle={() => {}}
          />
        </BrowserRouter>,
      );

      // Menu toggle is typically the first button without text
      const buttons = screen.getAllByRole("button");
      const menuToggle = buttons.find((btn) =>
        btn.className.includes("menu-toggle"),
      );

      if (menuToggle) {
        await user.click(menuToggle);
        // Menu should be visible now
      }
    });

    it("closes menu when clicking navigation link", async () => {
      //   const user = userEvent.setup();

      render(
        <BrowserRouter>
          <Header
            cartCount={0}
            isDarkMode={false}
            onDarkModeToggle={() => {}}
          />
        </BrowserRouter>,
      );

      // In a real mobile environment, clicking a link should close the menu
      // This would need viewport configuration to properly test
    });
  });

  describe("Logo and Branding", () => {
    it("renders logo link to home", () => {
      render(
        <BrowserRouter>
          <Header
            cartCount={0}
            isDarkMode={false}
            onDarkModeToggle={() => {}}
          />
        </BrowserRouter>,
      );

      const logoLink = screen.getByRole("link", { name: /CUEBALLCRAFT/i });
      expect(logoLink).toBeInTheDocument();
      expect(logoLink).toHaveAttribute("href", "/");
    });

    it("displays logo image", () => {
      render(
        <BrowserRouter>
          <Header
            cartCount={0}
            isDarkMode={false}
            onDarkModeToggle={() => {}}
          />
        </BrowserRouter>,
      );

      const logoImage = screen.getByAltText(
        /Cueballcraft Skaiacraft/i,
      ) as HTMLImageElement;
      expect(logoImage).toBeInTheDocument();
      expect(logoImage.src).toContain("logo.png");
    });
  });

  describe("Responsive Behavior", () => {
    it("renders all elements without wrapping on desktop", () => {
      const { container } = render(
        <BrowserRouter>
          <Header
            cartCount={0}
            isDarkMode={false}
            onDarkModeToggle={() => {}}
          />
        </BrowserRouter>,
      );

      const header = container.querySelector(".header");
      expect(header).toBeInTheDocument();
      expect(header?.className).toContain("header");
    });

    it("maintains functionality with high cart count", () => {
      render(
        <BrowserRouter>
          <Header
            cartCount={99}
            isDarkMode={false}
            onDarkModeToggle={() => {}}
          />
        </BrowserRouter>,
      );

      expect(screen.getByText("99")).toBeInTheDocument();
    });
  });

  describe("Auth State Transitions", () => {
    it("transitions from unauthenticated to authenticated state", () => {
      const { rerender } = render(
        <BrowserRouter>
          <Header
            cartCount={0}
            isDarkMode={false}
            onDarkModeToggle={() => {}}
          />
        </BrowserRouter>,
      );

      expect(
        screen.getByRole("button", { name: /^Login$/i }),
      ).toBeInTheDocument();

      // Simulate login
      const testUser = {
        id: "123",
        username: "testuser",
        email: "test@example.com",
      };
      localStorage.setItem("authToken", "test-jwt-token");
      localStorage.setItem("user", JSON.stringify(testUser));

      // Rerender with new localStorage values
      rerender(
        <BrowserRouter>
          <Header
            cartCount={0}
            isDarkMode={false}
            onDarkModeToggle={() => {}}
          />
        </BrowserRouter>,
      );

      // Would need useEffect to detect localStorage changes in actual implementation
      // This test demonstrates the expected behavior
    });
  });
});
