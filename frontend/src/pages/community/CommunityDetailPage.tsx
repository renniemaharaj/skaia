import { useEffect, useState } from "react";
import { Eye, MessageCircle, Pencil, Settings, SquarePen, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import Button from "../../components/input/Button";
import { InteractiveActionSection } from "../../components/page/InteractiveActionSection";
import { isPageDocument, PageDocumentContent } from "../../components/page/PageDocumentField";
import type { InteractiveConfig, InteractiveField } from "../../components/page/interactiveTypes";
import { MediaPlaceholder } from "../../components/ui/MediaPlaceholder";
import { RichTextRenderer } from "../../components/ui/RichTextRenderer";
import { confirmDestructiveAction } from "../../components/ui/Prompt";
import { apiRequest } from "../../utils/api";
import { CommunityModuleShell } from "./CommunityModuleShell";
import "./community.css";

interface Publication {
  id: number;
  kind: string;
  title: string;
  summary: string;
  body: string;
  visibility: string;
  author_name: string;
  page_id: number;
  page_slug: string;
  can_manage_page?: boolean;
  can_edit_thread?: boolean;
  can_edit?: boolean;
  can_delete?: boolean;
  can_transition?: boolean;
  can_vote?: boolean;
  can_attend?: boolean;
  canonical_thread_id: number;
  proposal?: { state: string; decision?: string; score: number; own_vote?: number };
  showcase?: { media: string[]; credits: string };
  event?: {
    starts_at: string;
    ends_at?: string;
    location: string;
    capacity?: number;
    going: number;
    own_attendance?: string;
  };
}

const actionConfig = (
  fields: InteractiveField[],
  submitLabel: string,
  successText: string
): InteractiveConfig => ({
  status: "open",
  submit_label: submitLabel,
  success_text: successText,
  result_visibility: "never",
  response_limit: 0,
  fields,
  records: [],
});

const proposalTransitions: Record<string, { key: string; label: string }[]> = {
  submitted: [{ key: "under_review", label: "Start review" }],
  under_review: [
    { key: "accepted", label: "Accept" },
    { key: "rejected", label: "Reject" },
  ],
  accepted: [
    { key: "completed", label: "Complete" },
    { key: "rejected", label: "Reject" },
  ],
};

export default function CommunityDetailPage() {
  const { kind, id } = useParams();
  const [data, setData] = useState<Publication | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const navigate = useNavigate();
  const load = () =>
    apiRequest<Publication>(`/community/${kind}/${id}`)
      .then(setData)
      .catch(caught => setError(caught instanceof Error ? caught.message : "Content unavailable"));

  useEffect(() => {
    void load();
  }, [kind, id]);

  const vote = async (answers: Record<string, unknown>) => {
    setActionError("");
    const value = answers.choice === "support" ? 1 : -1;
    const next = await apiRequest<Publication>(`/community/proposals/${id}/vote`, {
      method: "PUT",
      body: JSON.stringify({ value }),
    });
    setData(next);
  };
  const attend = async (answers: Record<string, unknown>) => {
    setActionError("");
    const next = await apiRequest<Publication>(`/community/events/${id}/attendance`, {
      method: "PUT",
      body: JSON.stringify({ status: answers.attendance }),
    });
    setData(next);
  };

  const remove = async () => {
    if (!data || !(await confirmDestructiveAction({
      title: `Delete this ${data.kind}?`,
      body: "The publication and its linked custom page will move to Trash together.",
      confirmLabel: `Delete ${data.kind}`,
    }))) return;
    try {
      await apiRequest(`/community/${data.kind}/${data.id}`, { method: "DELETE" });
      toast.success(`${data.kind[0].toUpperCase()}${data.kind.slice(1)} moved to Trash`);
      navigate(`/community/${data.kind}`);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Deletion failed");
    }
  };

  const transition = async (answers: Record<string, unknown>) => {
    setActionError("");
    const next = await apiRequest<Publication>(`/community/proposals/${id}/transition`, {
      method: "POST",
      body: JSON.stringify({
        state: answers.state,
        decision: typeof answers.decision === "string" ? answers.decision : "",
      }),
    });
    setData(next);
  };

  if (error) {
    return (
      <CommunityModuleShell
        backTo={`/community/${kind}`}
        backLabel={`Back to ${kind}s`}
      >
        <div className="community-detail-state">
          <p role="alert" className="community-error">
            {error}
          </p>
          <Button onClick={load}>Retry</Button>
        </div>
      </CommunityModuleShell>
    );
  }
  if (!data) {
    return (
      <CommunityModuleShell
        backTo={`/community/${kind}`}
        backLabel={`Back to ${kind}s`}
      >
        <div className="community-detail-state" aria-busy="true">
          <p role="status">Loading community content…</p>
        </div>
      </CommunityModuleShell>
    );
  }

  const hasPageDocument = isPageDocument(data.body);
  return (
    <CommunityModuleShell
      backTo={`/community/${data.kind}`}
      backLabel={`Back to ${data.kind}s`}
    >
      <main className="community-detail">
        <header>
          <div className="community-detail__heading">
            <span>{data.kind}</span>
            <h1>{data.title}</h1>
            <p>{data.summary}</p>
            <small>By {data.author_name}</small>
          </div>
          <div className="community-detail__page-actions">
              {(data.visibility === "public" || data.can_manage_page) && (
                <Link
                  className="action-btn"
                  to={`/page/${data.page_slug}`}
                  title="View full page"
                  aria-label="View full page"
                >
                  <Eye size={14} />
                </Link>
              )}
              {data.can_manage_page && (
                <Link
                  className="action-btn"
                  to={`/form/page/${data.page_slug}/manage`}
                  title="Manage page"
                  aria-label="Manage page"
                >
                  <Settings size={14} />
                </Link>
              )}
              <Link
                className="action-btn"
                to={`/view-thread/${data.canonical_thread_id}`}
                title="View discussion thread"
                aria-label="View discussion thread"
              >
                <MessageCircle size={14} />
              </Link>
              {data.can_edit_thread && (
                <Link
                  className="action-btn edit-btn"
                  to={`/edit-thread/${data.canonical_thread_id}`}
                  title="Edit discussion thread"
                  aria-label="Edit discussion thread"
                >
                  <SquarePen size={14} />
                </Link>
              )}
              {data.can_edit && (
                <Link
                  className="action-btn edit-btn"
                  to={`/form/community/${data.kind}/${data.id}/edit`}
                  title={`Edit ${data.kind}`}
                  aria-label={`Edit ${data.kind}`}
                >
                  <Pencil size={14} />
                </Link>
              )}
              {data.can_delete && (
                <Button
                  unstyled
                  className="action-btn danger"
                  title={`Delete ${data.kind}`}
                  aria-label={`Delete ${data.kind}`}
                  onClick={() => void remove()}
                >
                  <Trash2 size={14} />
                </Button>
              )}
          </div>
        </header>
        {actionError && <p role="alert" className="community-error">{actionError}</p>}
        {data.showcase?.media?.length ? (
          <div className="community-media">
            {data.showcase.media.slice(0, 12).map(url => (
              <MediaPlaceholder
                key={url}
                href={url}
                alt="Showcase media"
                mediaType="image"
                layout="thumbnail"
              />
            ))}
          </div>
        ) : null}
        {hasPageDocument ? (
          <PageDocumentContent
            value={data.body}
            pageKey={`page:${data.page_id}`}
            pageId={data.page_id}
          />
        ) : (
          <RichTextRenderer html={data.body} />
        )}
        {data.proposal && (
          <section className="community-workflow-summary">
            <strong>
              {data.proposal.state.replaceAll("_", " ")} · {data.proposal.score} votes
            </strong>
            {data.proposal.decision && <p>{data.proposal.decision}</p>}
          </section>
        )}
        {data.proposal && data.can_vote && (
          <InteractiveActionSection
            id={`proposal-vote-${data.id}`}
            type="vote"
            heading="Your vote"
            description="Support or oppose this proposal. You can update your selection."
            config={actionConfig(
              [{
                key: "choice",
                type: "radio",
                label: "Position",
                required: true,
                options: [
                  { key: "support", label: "Support" },
                  { key: "oppose", label: "Oppose" },
                ],
              }],
              data.proposal.own_vote ? "Update vote" : "Submit vote",
              "Your vote was recorded."
            )}
            submission={{
              mode: "replace",
              initialAnswers: {
                choice: data.proposal.own_vote === 1
                  ? "support"
                  : data.proposal.own_vote === -1
                    ? "oppose"
                    : "",
              },
              submit: vote,
            }}
          />
        )}
        {data.proposal && data.can_transition && proposalTransitions[data.proposal.state] && (
          <InteractiveActionSection
            id={`proposal-transition-${data.id}`}
            type="form"
            heading="Proposal moderation"
            description="Apply the next permitted workflow state and record an optional decision note."
            config={actionConfig(
              [
                {
                  key: "state",
                  type: "radio",
                  label: "Next state",
                  required: true,
                  options: proposalTransitions[data.proposal.state],
                },
                {
                  key: "decision",
                  type: "textarea",
                  label: "Decision note",
                  placeholder: "Optional moderation context",
                },
              ],
              "Apply transition",
              "Proposal state updated."
            )}
            submission={{ mode: "replace", submit: transition }}
          />
        )}
        {data.event && (
          <section className="community-workflow-summary">
            <strong>{new Date(data.event.starts_at).toLocaleString()}</strong>
            <p>
              {data.event.location} · {data.event.going}
              {data.event.capacity ? ` / ${data.event.capacity}` : ""} going
            </p>
          </section>
        )}
        {data.event && data.can_attend && (
          <InteractiveActionSection
            id={`event-attendance-${data.id}`}
            type="poll"
            heading="Attendance"
            description="Tell the host whether you are going or interested."
            config={actionConfig(
              [{
                key: "attendance",
                type: "radio",
                label: "Response",
                required: true,
                options: [
                  { key: "going", label: "Going" },
                  { key: "interested", label: "Interested" },
                ],
              }],
              data.event.own_attendance ? "Update response" : "Submit response",
              "Attendance updated."
            )}
            submission={{
              mode: "replace",
              initialAnswers: { attendance: data.event.own_attendance ?? "" },
              submit: attend,
            }}
          />
        )}
      </main>
    </CommunityModuleShell>
  );
}
