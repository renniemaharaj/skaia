import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { PromptContainer } from "../../components/ui/Prompt";
import TrashPage from "./TrashPage";

const { apiRequestMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
}));

vi.mock("../../utils/api", () => ({
  apiRequest: apiRequestMock,
}));

describe("TrashPage", () => {
  beforeEach(() => {
    apiRequestMock.mockReset();
    apiRequestMock.mockResolvedValueOnce({
      groups: [
        {
          resource: "forum_thread",
          label: "Forum threads",
          items: [
            {
              resource: "forum_thread",
              id: "7",
              label: "A deleted thread",
              detail: "Forum thread",
              deleted_at: "2026-07-26T12:00:00Z",
            },
          ],
          has_more: false,
        },
        {
          resource: "thread_comment",
          label: "Thread comments",
          items: [
            {
              resource: "thread_comment",
              id: "9",
              label: "Comment #9",
              detail: "Thread #7",
              deleted_at: "2026-07-26T12:05:00Z",
            },
          ],
          has_more: false,
        },
      ],
    });
  });

  it("groups resource table views and only restores after confirmation", async () => {
    const user = userEvent.setup();
    apiRequestMock.mockResolvedValue({ status: "restored" });
    render(
      <>
        <TrashPage />
        <PromptContainer />
      </>
    );

    const threads = await screen.findByRole("region", { name: "Forum threads" });
    expect(within(threads).getByText("A deleted thread")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Thread comments" })).toBeInTheDocument();

    await user.click(within(threads).getByRole("button", { name: "Restore A deleted thread" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(apiRequestMock).toHaveBeenCalledTimes(1);

    await user.click(within(threads).getByRole("button", { name: "Restore A deleted thread" }));
    await user.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() =>
      expect(apiRequestMock).toHaveBeenCalledWith("/trash/forum_thread/7/restore", {
        method: "POST",
      })
    );
    expect(apiRequestMock).toHaveBeenCalledTimes(2);
  });
});
