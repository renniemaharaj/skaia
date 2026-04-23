import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SecuritySettings from "./SecuritySettings";

// Minimal props for self-management
const baseProps = {
  emailVerified: true,
  totpEnabled: false,
  onUpdate: vi.fn(),
};

describe("SecuritySettings", () => {
  it("renders 2FA setup button when not enabled", () => {
    render(<SecuritySettings {...baseProps} />);
    expect(screen.getByText(/Set Up 2FA/i)).toBeInTheDocument();
  });

  it("renders 2FA disable button when enabled", () => {
    render(<SecuritySettings {...baseProps} totpEnabled={true} />);
    expect(screen.getByText(/Disable 2FA/i)).toBeInTheDocument();
  });

  it("shows admin controls for managed user", () => {
    render(
      <SecuritySettings
        {...baseProps}
        canManage={true}
        managedUserId="123"
        managedUsername="testuser"
      />,
    );
    expect(screen.getByText(/Manage 2FA for/i)).toBeInTheDocument();
    expect(screen.getByText(/Enable 2FA/i)).toBeInTheDocument();
    expect(screen.getByText(/Generate Backup Codes/i)).toBeInTheDocument();
    expect(screen.getByText(/Setup Email Verification/i)).toBeInTheDocument();
  });
});
