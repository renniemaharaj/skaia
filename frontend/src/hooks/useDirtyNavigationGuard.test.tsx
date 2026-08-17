import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { PromptContainer } from "../components/ui/Prompt";
import { useDirtyNavigationGuard } from "./useDirtyNavigationGuard";

function GuardHarness() {
  const location = useLocation();
  useDirtyNavigationGuard(true, { title: "Discard changes?", body: "Unsaved content." });
  return (
    <>
      <a href="/next">Next guide</a>
      <output>{location.pathname}</output>
      <PromptContainer />
    </>
  );
}

describe("useDirtyNavigationGuard", () => {
  it("protects same-origin links without requiring a data router", async () => {
    render(
      <MemoryRouter initialEntries={["/current"]}>
        <GuardHarness />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("link", { name: "Next guide" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("Discard changes?");
    fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(await screen.findByText("/next")).toBeInTheDocument();
  });
});
