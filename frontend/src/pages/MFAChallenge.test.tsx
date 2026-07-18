import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import MFAChallenge from "./MFAChallenge";

describe("MFAChallenge", () => {
  it("shows an IP-change reason", () => {
    render(<MFAChallenge totpToken="" reasonCode="ip_changed" />);

    expect(screen.getByText("Why now: IP address changed")).toBeInTheDocument();
    expect(screen.getByText("Use your authenticator code.")).toBeInTheDocument();
  });

  it("shows suspicious activity explicitly", () => {
    render(<MFAChallenge totpToken="" reasonCode="suspicious_activity" />);

    expect(screen.getByText("Why now: Suspicious activity")).toBeInTheDocument();
  });

  it("names the sensitive action", () => {
    render(
      <MFAChallenge totpToken="" reasonCode="sensitive_action" action="approve password recovery" />
    );

    expect(screen.getByText("Why now: Required to approve password recovery")).toBeInTheDocument();
  });
});
