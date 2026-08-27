import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import Button from "./Button";
import Checkbox from "./Checkbox";
import ComposerInput from "./ComposerInput";
import { EmptyState } from "./EmptyState";
import Select from "./Select";
import Surface from "./Surface";
import { TextArea, TextField } from "./TextField";
import LegacyButton from "../input/Button";
import LegacyCheckbox from "../input/Checkbox";
import LegacyInput from "../input/Input";
import LegacySelect from "../input/Select";
import LegacyTile from "../input/Tile";

describe("foundation primitives", () => {
  it("keeps button loading semantics consistent", () => {
    render(<Button loading>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("supports controlled select changes through the accessible menu", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState("one");
      return (
        <Select
          label="Choice"
          value={value}
          options={[
            { value: "one", label: "One" },
            { value: "two", label: "Two" },
          ]}
          onChange={event => setValue(event.target.value)}
        />
      );
    }
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: "Choice" }));
    await user.click(screen.getByRole("menuitem", { name: "Two" }));
    expect(screen.getByRole("button", { name: "Choice" })).toHaveTextContent("Two");
  });

  it("associates checkbox labels and disabled state", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<Checkbox label="Publish" checked={false} onChange={onChange} />);
    await user.click(screen.getByLabelText("Publish"));
    expect(onChange).toHaveBeenCalledOnce();
    rerender(<Checkbox label="Publish" checked={false} disabled onChange={onChange} />);
    expect(screen.getByLabelText("Publish")).toBeDisabled();
  });

  it("supports uncontrolled checkbox state", async () => {
    const user = userEvent.setup();
    render(<Checkbox label="Remember me" defaultChecked={false} />);
    const checkbox = screen.getByLabelText("Remember me");
    await user.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it("gives interactive surfaces keyboard behavior", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Surface variant="interactive" selected onClick={onClick}>
        Template
      </Surface>
    );
    const surface = screen.getByRole("button", { name: "Template" });
    expect(surface).toHaveAttribute("aria-pressed", "true");
    surface.focus();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("submits trimmed composer content", async () => {
    const user = userEvent.setup();
    const handleSend = vi.fn();
    render(<ComposerInput handleSend={handleSend} placeholder="Message" />);
    await user.type(screen.getByRole("textbox", { name: "Message" }), "hello{Enter}");
    expect(handleSend).toHaveBeenCalledWith("hello");
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue("");
  });

  it("connects field help and errors to their controls", () => {
    render(
      <>
        <TextField label="Name" help="Public name" />
        <TextArea label="Summary" error="Required" />
      </>
    );
    expect(screen.getByLabelText("Name")).toHaveAccessibleDescription("Public name");
    expect(screen.getByLabelText("Summary")).toHaveAccessibleDescription("Required");
    expect(screen.getByLabelText("Summary")).toHaveAttribute("aria-invalid", "true");
  });

  it("provides one accessible feedback structure", () => {
    render(<EmptyState title="Nothing here" description="Create the first item." />);
    expect(screen.getByRole("region", { name: "Empty state" })).toHaveTextContent(
      "Nothing hereCreate the first item."
    );
  });

  it("keeps input-era imports as compatibility-only aliases", () => {
    expect(LegacyButton).toBe(Button);
    expect(LegacyCheckbox).toBe(Checkbox);
    expect(LegacyInput).toBe(ComposerInput);
    expect(LegacySelect).toBe(Select);
    expect(LegacyTile).toBe(Surface);
  });
});
