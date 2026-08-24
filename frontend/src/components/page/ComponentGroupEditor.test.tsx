import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ComponentGroupEditor } from "./ComponentGroupEditor";
import type { ComponentDefinition, ComponentGroup } from "./types";

const components: ComponentDefinition[] = [
  {
    type: "primitive.text",
    label: "Text",
    group: "primitive",
    description: "Text",
    repeatable: true,
    props_schema: {},
    style_targets: ["root"],
    bind_points: [
      { key: "body", label: "Body", description: "", kind: "text", required: true },
    ],
    version: 1,
  },
  {
    type: "compound.stat",
    label: "Stat Card",
    group: "compound",
    description: "Metric",
    repeatable: true,
    props_schema: {},
    style_targets: ["root", "value", "label", "icon"],
    bind_points: [],
    version: 1,
  },
];

function Harness() {
  const [group, setGroup] = useState<ComponentGroup>({
    items: [
      { id: "text", component_type: "primitive.text", bindings: {}, width: 100, order: 0 },
      { id: "stat", component_type: "compound.stat", bindings: {}, width: 40, order: 1 },
    ],
    gap: 16,
    max_width: 800,
  });
  return (
    <ComponentGroupEditor
      group={group}
      components={components}
      availableColumns={[]}
      firstRow={null}
      onChange={setGroup}
    />
  );
}

describe("ComponentGroupEditor", () => {
  it("allows a width to be replaced before committing it", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const width = screen.getAllByLabelText("Component width percentage")[0];

    await user.clear(width);
    await user.type(width, "50");
    expect(width).toHaveValue(50);

    await user.tab();
    expect(width).toHaveValue(50);
  });

  it("moves components with the up control", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getAllByLabelText("Move component up")[1]);

    const widths = screen.getAllByLabelText("Component width percentage");
    expect(widths[0]).toHaveValue(40);
    expect(widths[1]).toHaveValue(100);
  });

  it("requests the datasource split-pane workspace from Expand", async () => {
    const user = userEvent.setup();
    const onWorkspaceModeChange = vi.fn();
    render(
      <ComponentGroupEditor
        group={{ items: [], gap: 16, max_width: 800 }}
        components={components}
        availableColumns={[]}
        firstRow={null}
        onChange={() => {}}
        onWorkspaceModeChange={onWorkspaceModeChange}
      />
    );

    await user.click(screen.getByRole("button", { name: "Open component workspace" }));

    expect(onWorkspaceModeChange).toHaveBeenCalledWith(true);
  });
});
