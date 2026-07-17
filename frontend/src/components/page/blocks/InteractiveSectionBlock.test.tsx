import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../../utils/api";
import { PageBuilderContext } from "../PageBuilderContext";
import type { InteractiveConfig } from "../interactiveTypes";
import type { PageSection } from "../types";
import { InteractiveSectionBlock, ResultsView } from "./InteractiveSectionBlock";

vi.mock("../../../utils/api", async importOriginal => {
  const actual = await importOriginal<typeof import("../../../utils/api")>();
  return { ...actual, apiRequest: vi.fn() };
});
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const config: InteractiveConfig = {
  status: "open",
  submit_label: "Submit",
  success_text: "Saved",
  result_visibility: "always",
  response_limit: 1,
  fields: [
    { key: "consent", type: "consent", label: "Consent" },
    { key: "score", type: "nps", label: "Score" },
  ],
  records: [
    {
      id: "record-1",
      user_id: 7,
      respondent_name: "Ada",
      answers: { consent: true, score: 10 },
      status: "submitted",
      submitted_at: "2026-07-17T12:00:00Z",
    },
  ],
  result_summary: {
    total: 1,
    counts: { consent: { true: 1 }, score: { "10": 1 } },
  },
};

describe("InteractiveSectionBlock", () => {
  it("renders boolean and numeric aggregate variants and the unavailable state", () => {
    const view = render(<ResultsView config={config} />);
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getAllByText("1 · 100%")).toHaveLength(2);

    view.rerender(<ResultsView config={{ ...config, result_summary: undefined }} />);
    expect(screen.getByText("Results are not available yet.")).toBeInTheDocument();
  });

  it("renders manager response rows and expanded submitted values", () => {
    const section: PageSection = {
      id: 3,
      display_order: 1,
      section_type: "survey",
      heading: "Survey",
      subheading: "",
      config: JSON.stringify(config),
    };
    render(
      <PageBuilderContext.Provider
        value={{
          editingCount: 0,
          enterEdit: vi.fn(),
          leaveEdit: vi.fn(),
          saveStatus: "idle",
          pendingIncoming: false,
          pageId: 1,
          canManagePage: true,
        }}
      >
        <InteractiveSectionBlock section={section} canEdit onUpdate={vi.fn()} onDelete={vi.fn()} />
      </PageBuilderContext.Provider>
    );
    fireEvent.click(screen.getByRole("tab", { name: "Responses" }));
    expect(screen.getByText("Ada")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Toggle response details" }));
    expect(screen.getByLabelText("Submitted response")).toHaveTextContent("Yes");
    expect(screen.getByLabelText("Submitted response")).toHaveTextContent("10");
  });

  it("shows explicit moderation failure feedback", async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(new Error("moderation denied"));
    const qaConfig: InteractiveConfig = {
      ...config,
      fields: [{ key: "question", type: "textarea", label: "Question" }],
      records: [
        {
          id: "question-1",
          respondent_name: "Grace",
          answers: { question: "Can this fail?" },
          status: "pending",
          submitted_at: "2026-07-17T12:00:00Z",
        },
      ],
    };
    render(
      <PageBuilderContext.Provider
        value={{
          editingCount: 0,
          enterEdit: vi.fn(),
          leaveEdit: vi.fn(),
          saveStatus: "idle",
          pendingIncoming: false,
          pageId: 1,
          canManagePage: true,
        }}
      >
        <InteractiveSectionBlock
          section={{
            id: 4,
            display_order: 1,
            section_type: "qa",
            heading: "Questions",
            subheading: "",
            config: JSON.stringify(qaConfig),
          }}
          canEdit
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
        />
      </PageBuilderContext.Provider>
    );
    fireEvent.click(screen.getByRole("tab", { name: "Moderation" }));
    fireEvent.click(screen.getByRole("button", { name: "Toggle response details" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("moderation denied"));
  });
});
