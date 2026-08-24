import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { inputTextBinding } from "./componentBindings";
import { ComponentRenderer } from "./ComponentRenderer";
import type { ComponentDefinition } from "./types";

const statComponent: ComponentDefinition = {
  type: "compound.stat",
  label: "Stat Card",
  group: "compound",
  description: "Metric",
  repeatable: true,
  props_schema: {},
  style_targets: ["root", "value", "label", "icon"],
  bind_points: [
    { key: "title", label: "Value", description: "", kind: "text", required: true },
    { key: "body", label: "Label", description: "", kind: "text", required: false },
    { key: "icon", label: "Icon", description: "", kind: "text", required: false },
  ],
  version: 1,
};

describe("ComponentRenderer stat cards", () => {
  it("renders a selected named icon in the configured position", () => {
    const { container } = render(
      <ComponentRenderer
        component={statComponent}
        bindings={{
          title: "players_online",
          body: inputTextBinding("Players"),
          icon: inputTextBinding("Users"),
        }}
        row={{ players_online: 4 }}
        iconPosition="top-right"
      />
    );

    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Players")).toBeInTheDocument();
    expect(container.querySelector(".cr-stat--icon-top-right svg")).toBeInTheDocument();
  });
});
