import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { PromptContainer, confirmDestructiveAction, customConfirm } from "./Prompt";

function Harness() {
  const [result, setResult] = useState("pending");
  return (
    <>
      <button
        type="button"
        onClick={() => {
          void confirmDestructiveAction({
            title: "Delete page?",
            body: "The page will move to Trash.",
            confirmLabel: "Delete page",
          }).then(value => setResult(String(value)));
        }}
      >
        Open
      </button>
      <output>{result}</output>
      <PromptContainer />
    </>
  );
}

describe("PromptContainer", () => {
  it("renders an accessible destructive dialog, cancels, and restores focus", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open" });
    await user.click(trigger);

    expect(screen.getByRole("alertdialog", { name: "Delete page?" })).toBeInTheDocument();
    expect(screen.getByText("The page will move to Trash.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("false")).toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("serializes concurrent requests without stranding either promise", async () => {
    const user = userEvent.setup();
    const results: boolean[] = [];
    function QueueHarness() {
      return (
        <>
          <button
            type="button"
            onClick={() => {
              void customConfirm("First request").then(value => results.push(value));
              void customConfirm("Second request").then(value => results.push(value));
            }}
          >
            Queue
          </button>
          <PromptContainer />
        </>
      );
    }
    render(<QueueHarness />);
    await user.click(screen.getByRole("button", { name: "Queue" }));
    expect(screen.getByText("First request")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByText("Second request")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(results).toEqual([true, false]);
  });

  it("requires an exact typed confirmation value", async () => {
    const user = userEvent.setup();
    function TypedHarness() {
      return (
        <>
          <button
            type="button"
            onClick={() => {
              void confirmDestructiveAction({
                body: "Delete selected files permanently.",
                typedConfirmation: { value: "DELETE" },
              });
            }}
          >
            Delete files
          </button>
          <PromptContainer />
        </>
      );
    }
    render(<TypedHarness />);
    await user.click(screen.getByRole("button", { name: "Delete files" }));
    const confirmButton = screen.getByRole("button", { name: "Confirm" });
    expect(confirmButton).toBeDisabled();

    await user.type(screen.getByLabelText(/Type DELETE to continue/), "DELETE");
    expect(confirmButton).toBeEnabled();
  });
});
