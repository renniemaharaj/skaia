import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import MFAChallenge from "./MFAChallenge";

describe("MFAChallenge", () => {
  it("shows an IP-change reason", () => {
    render(<MFAChallenge totpToken="" reasonCode="ip_changed" />);

    expect(screen.getByText("IP address changed")).toBeInTheDocument();
    expect(
      screen.getByText("This session moved to a different network address.")
    ).toBeInTheDocument();
  });

  it("shows suspicious activity explicitly", () => {
    render(<MFAChallenge totpToken="" reasonCode="suspicious_activity" />);

    expect(screen.getByText("Suspicious activity")).toBeInTheDocument();
  });

  it("names the sensitive action", () => {
    render(
      <MFAChallenge totpToken="" reasonCode="sensitive_action" action="approve password recovery" />
    );

    expect(screen.getByText("Required to approve password recovery")).toBeInTheDocument();
  });
});
