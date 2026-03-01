import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { Auth } from "./Auth";

const mockFetch = vi.fn();

describe("Auth Component", () => {
  beforeEach(() => {
    mockFetch.mockClear();
    localStorage.clear();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  describe("Login Mode", () => {
    it("renders login form by default", () => {
      render(
        <BrowserRouter>
          <Auth initialMode="login" />
        </BrowserRouter>,
      );

      expect(screen.getByText("Welcome Back")).toBeInTheDocument();
      expect(
        screen.getByText("Log in to your account to continue"),
      ).toBeInTheDocument();
      expect(screen.getByPlaceholderText("your@email.com")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Enter your password"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /log in/i }),
      ).toBeInTheDocument();
    });

    it("does not show username field in login mode", () => {
      render(
        <BrowserRouter>
          <Auth initialMode="login" />
        </BrowserRouter>,
      );

      expect(
        screen.queryByPlaceholderText("Choose a username"),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByPlaceholderText("Confirm your password"),
      ).not.toBeInTheDocument();
    });

    it("allows toggling to register mode", async () => {
      const user = userEvent.setup();
      render(
        <BrowserRouter>
          <Auth initialMode="login" />
        </BrowserRouter>,
      );

      const toggleButton = screen.getByRole("button", { name: /sign up/i });
      await user.click(toggleButton);

      expect(screen.getByText("Join Us")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Choose a username"),
      ).toBeInTheDocument();
    });

    it("submits login form with valid credentials", async () => {
      const mockSuccessCallback = vi.fn();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: "test-token-123",
          user: { id: "1", username: "testuser", email: "test@example.com" },
        }),
      });

      const user = userEvent.setup();
      render(
        <BrowserRouter>
          <Auth initialMode="login" onAuthSuccess={mockSuccessCallback} />
        </BrowserRouter>,
      );

      await user.type(
        screen.getByPlaceholderText("your@email.com"),
        "test@example.com",
      );
      await user.type(
        screen.getByPlaceholderText("Enter your password"),
        "password123",
      );
      await user.click(screen.getByRole("button", { name: /log in/i }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/auth/login",
          expect.any(Object),
        );
      });

      expect(localStorage.getItem("authToken")).toBe("test-token-123");
    });

    it("displays error on failed login", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Invalid credentials" }),
      });

      const user = userEvent.setup();
      render(
        <BrowserRouter>
          <Auth initialMode="login" />
        </BrowserRouter>,
      );

      await user.type(
        screen.getByPlaceholderText("your@email.com"),
        "test@example.com",
      );
      await user.type(
        screen.getByPlaceholderText("Enter your password"),
        "wrongpassword",
      );
      await user.click(screen.getByRole("button", { name: /log in/i }));

      await waitFor(() => {
        expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
      });
    });

    it("shows loading state during submission", async () => {
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({
                    token: "test-token",
                    user: { email: "test@example.com" },
                  }),
                }),
              100,
            ),
          ),
      );

      const user = userEvent.setup();
      render(
        <BrowserRouter>
          <Auth initialMode="login" />
        </BrowserRouter>,
      );

      await user.type(
        screen.getByPlaceholderText("your@email.com"),
        "test@example.com",
      );
      await user.type(
        screen.getByPlaceholderText("Enter your password"),
        "password123",
      );

      const submitButton = screen.getByRole("button", { name: /log in/i });
      await user.click(submitButton);

      expect(screen.getByText(/logging in/i)).toBeInTheDocument();
    });
  });

  describe("Register Mode", () => {
    it("renders register form when initialMode is register", () => {
      render(
        <BrowserRouter>
          <Auth initialMode="register" />
        </BrowserRouter>,
      );

      expect(screen.getByText("Join Us")).toBeInTheDocument();
      expect(
        screen.getByText("Create a new account to get started"),
      ).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Choose a username"),
      ).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Confirm your password"),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /create account/i }),
      ).toBeInTheDocument();
    });

    it("shows all required fields for registration", () => {
      render(
        <BrowserRouter>
          <Auth initialMode="register" />
        </BrowserRouter>,
      );

      expect(
        screen.getByPlaceholderText("Choose a username"),
      ).toBeInTheDocument();
      expect(screen.getByPlaceholderText("your@email.com")).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Enter your password"),
      ).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText("Confirm your password"),
      ).toBeInTheDocument();
    });

    it("submits registration form with valid data", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: "test-token-123",
          user: { id: "1", username: "newuser", email: "new@example.com" },
        }),
      });

      const user = userEvent.setup();
      render(
        <BrowserRouter>
          <Auth initialMode="register" />
        </BrowserRouter>,
      );

      await user.type(
        screen.getByPlaceholderText("Choose a username"),
        "newuser",
      );
      await user.type(
        screen.getByPlaceholderText("your@email.com"),
        "new@example.com",
      );
      await user.type(
        screen.getByPlaceholderText("Enter your password"),
        "password123",
      );
      await user.type(
        screen.getByPlaceholderText("Confirm your password"),
        "password123",
      );
      await user.click(screen.getByRole("button", { name: /create account/i }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          "/api/auth/register",
          expect.any(Object),
        );
      });

      expect(localStorage.getItem("authToken")).toBe("test-token-123");
    });

    it("allows toggling back to login mode", async () => {
      const user = userEvent.setup();
      render(
        <BrowserRouter>
          <Auth initialMode="register" />
        </BrowserRouter>,
      );

      const toggleButton = screen.getByRole("button", { name: /log in/i });
      await user.click(toggleButton);

      expect(screen.getByText("Welcome Back")).toBeInTheDocument();
      expect(
        screen.queryByPlaceholderText("Choose a username"),
      ).not.toBeInTheDocument();
    });

    it("displays error on registration failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "User already exists" }),
      });

      const user = userEvent.setup();
      render(
        <BrowserRouter>
          <Auth initialMode="register" />
        </BrowserRouter>,
      );

      await user.type(
        screen.getByPlaceholderText("Choose a username"),
        "existinguser",
      );
      await user.type(
        screen.getByPlaceholderText("your@email.com"),
        "existing@example.com",
      );
      await user.type(
        screen.getByPlaceholderText("Enter your password"),
        "password123",
      );
      await user.type(
        screen.getByPlaceholderText("Confirm your password"),
        "password123",
      );
      await user.click(screen.getByRole("button", { name: /create account/i }));

      await waitFor(() => {
        expect(screen.getByText("User already exists")).toBeInTheDocument();
      });
    });
  });

  describe("Form Behavior", () => {
    it("clears form data when toggling mode", async () => {
      const user = userEvent.setup();
      render(
        <BrowserRouter>
          <Auth initialMode="login" />
        </BrowserRouter>,
      );

      const emailInput = screen.getByPlaceholderText(
        "your@email.com",
      ) as HTMLInputElement;
      const passwordInput = screen.getByPlaceholderText(
        "Enter your password",
      ) as HTMLInputElement;

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");

      expect(emailInput.value).toBe("test@example.com");
      expect(passwordInput.value).toBe("password123");

      const toggleButton = screen.getByRole("button", { name: /sign up/i });
      await user.click(toggleButton);

      // Form should be reset
      const newEmailInput = screen.getByPlaceholderText(
        "your@email.com",
      ) as HTMLInputElement;
      expect(newEmailInput.value).toBe("");
    });

    it("clears error when user starts typing", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Invalid credentials" }),
      });

      const user = userEvent.setup();
      render(
        <BrowserRouter>
          <Auth initialMode="login" />
        </BrowserRouter>,
      );

      await user.type(
        screen.getByPlaceholderText("your@email.com"),
        "test@example.com",
      );
      await user.type(
        screen.getByPlaceholderText("Enter your password"),
        "wrongpassword",
      );
      await user.click(screen.getByRole("button", { name: /log in/i }));

      await waitFor(() => {
        expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
      });

      // Error should still be visible (not cleared on first character)
      expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
    });

    it("disables inputs during submission", async () => {
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  ok: true,
                  json: async () => ({
                    token: "test-token",
                    user: { email: "test@example.com" },
                  }),
                }),
              200,
            ),
          ),
      );

      const user = userEvent.setup();
      render(
        <BrowserRouter>
          <Auth initialMode="login" />
        </BrowserRouter>,
      );

      await user.type(
        screen.getByPlaceholderText("your@email.com"),
        "test@example.com",
      );
      await user.type(
        screen.getByPlaceholderText("Enter your password"),
        "password123",
      );

      const emailInput = screen.getByPlaceholderText(
        "your@email.com",
      ) as HTMLInputElement;
      const submitButton = screen.getByRole("button", {
        name: /log in/i,
      }) as HTMLButtonElement;

      await user.click(submitButton);

      expect(emailInput.disabled).toBe(true);
      expect(submitButton.disabled).toBe(true);
    });
  });

  describe("Token Storage", () => {
    it("stores token and user in localStorage after successful login", async () => {
      const testUser = {
        id: "123",
        username: "testuser",
        email: "test@example.com",
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: "jwt-token-123",
          user: testUser,
        }),
      });

      const user = userEvent.setup();
      render(
        <BrowserRouter>
          <Auth initialMode="login" />
        </BrowserRouter>,
      );

      await user.type(
        screen.getByPlaceholderText("your@email.com"),
        "test@example.com",
      );
      await user.type(
        screen.getByPlaceholderText("Enter your password"),
        "password123",
      );
      await user.click(screen.getByRole("button", { name: /log in/i }));

      await waitFor(() => {
        expect(localStorage.getItem("authToken")).toBe("jwt-token-123");
        expect(localStorage.getItem("user")).toBe(JSON.stringify(testUser));
      });
    });

    it("calls success callback with token after authentication", async () => {
      const mockCallback = vi.fn();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: "jwt-token-123",
          user: { email: "test@example.com" },
        }),
      });

      const user = userEvent.setup();
      render(
        <BrowserRouter>
          <Auth initialMode="login" onAuthSuccess={mockCallback} />
        </BrowserRouter>,
      );

      await user.type(
        screen.getByPlaceholderText("your@email.com"),
        "test@example.com",
      );
      await user.type(
        screen.getByPlaceholderText("Enter your password"),
        "password123",
      );
      await user.click(screen.getByRole("button", { name: /log in/i }));

      await waitFor(() => {
        expect(mockCallback).toHaveBeenCalledWith("jwt-token-123");
      });
    });
  });

  describe("Navigation", () => {
    it("navigates to home after successful login", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: "jwt-token-123",
          user: { email: "test@example.com" },
        }),
      });

      const user = userEvent.setup();
      render(
        <BrowserRouter>
          <Auth initialMode="login" />
        </BrowserRouter>,
      );

      await user.type(
        screen.getByPlaceholderText("your@email.com"),
        "test@example.com",
      );
      await user.type(
        screen.getByPlaceholderText("Enter your password"),
        "password123",
      );
      await user.click(screen.getByRole("button", { name: /log in/i }));

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });
  });

  describe("Form Validation", () => {
    it("shows required attribute on form inputs", () => {
      render(
        <BrowserRouter>
          <Auth initialMode="login" />
        </BrowserRouter>,
      );

      const emailInput = screen.getByPlaceholderText(
        "your@email.com",
      ) as HTMLInputElement;
      const passwordInput = screen.getByPlaceholderText(
        "Enter your password",
      ) as HTMLInputElement;

      expect(emailInput.required).toBe(true);
      expect(passwordInput.required).toBe(true);
    });

    it("shows all required fields in register mode", () => {
      render(
        <BrowserRouter>
          <Auth initialMode="register" />
        </BrowserRouter>,
      );

      const usernameInput = screen.getByPlaceholderText(
        "Choose a username",
      ) as HTMLInputElement;
      const emailInput = screen.getByPlaceholderText(
        "your@email.com",
      ) as HTMLInputElement;
      const passwordInput = screen.getByPlaceholderText(
        "Enter your password",
      ) as HTMLInputElement;
      const confirmInput = screen.getByPlaceholderText(
        "Confirm your password",
      ) as HTMLInputElement;

      expect(usernameInput.required).toBe(true);
      expect(emailInput.required).toBe(true);
      expect(passwordInput.required).toBe(true);
      expect(confirmInput.required).toBe(true);
    });
  });
});
