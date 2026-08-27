import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../utils/api";
import MetaControlPanel from "./MetaControlPanel";

vi.mock("../../utils/api", () => ({ apiRequest: vi.fn() }));

const initialConfig = {
  description: "Example site",
  og_image: "",
  dom_skin: "",
  dom_video: "",
  particle_style: "none",
  font_family: "",
};

describe("MetaControlPanel typography", () => {
  beforeEach(() => vi.mocked(apiRequest).mockReset());

  it("saves a custom Google Font family through site configuration", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter initialEntries={["/form/site/visuals"]}>
        <MetaControlPanel category="visuals" initialConfig={initialConfig} />
      </MemoryRouter>
    );

    const preset = container.querySelector('select[name="fontPreset"]');
    expect(preset).not.toBeNull();
    fireEvent.change(preset as HTMLSelectElement, { target: { value: "custom" } });

    await user.type(screen.getByLabelText("Google Font family"), "IBM Plex Sans");
    await user.click(screen.getByRole("button", { name: "Save site settings" }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledOnce());
    const [, request] = vi.mocked(apiRequest).mock.calls[0];
    expect(request?.method).toBe("PUT");
    expect(JSON.parse(String(request?.body))).toMatchObject({ font_family: "IBM Plex Sans" });
  });
});
