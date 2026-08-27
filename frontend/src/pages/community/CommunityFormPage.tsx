import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import Button from "../../components/ui/Button";
import { FormField, FormSelect, ManagedForm } from "../../components/form";
import { apiRequest } from "../../utils/api";
import { CommunityModuleShell } from "./CommunityModuleShell";

interface Values {
  slug: string;
  title: string;
  summary: string;
  visibility: string;
  media: string;
  credits: string;
  starts_at: string;
  ends_at: string;
  location: string;
  capacity: string;
  publication_status: string;
}

interface Publication {
  id: number;
  kind: string;
  slug: string;
  title: string;
  summary: string;
  visibility: string;
  publication_status: string;
  can_edit?: boolean;
  showcase?: { media: string[]; credits: string };
  event?: { starts_at: string; ends_at?: string; location: string; capacity?: number };
}

const emptyValues: Values = {
  slug: "",
  title: "",
  summary: "",
  visibility: "public",
  media: "",
  credits: "",
  starts_at: "",
  ends_at: "",
  location: "",
  capacity: "",
  publication_status: "draft",
};

function localDateTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function CommunityFormPage() {
  const raw = useParams().kind;
  const kind = raw === "showcase" || raw === "event" ? raw : "proposal";
  const id = useParams().id;
  const editing = Boolean(id);
  const navigate = useNavigate();
  const [publication, setPublication] = useState<Publication | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!id) return;
    apiRequest<Publication>(`/community/${kind}/${id}`)
      .then(setPublication)
      .catch(caught =>
        setLoadError(caught instanceof Error ? caught.message : "Content unavailable")
      );
  }, [id, kind]);

  if (editing && loadError) {
    return (
      <CommunityModuleShell
        backTo={`/community/${kind}/${id}`}
        backLabel={`Back to ${kind}`}
        comfortable
      >
        <main className="community-form-state">
          <p role="alert" className="community-error">
            {loadError}
          </p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </main>
      </CommunityModuleShell>
    );
  }
  if (editing && !publication) {
    return (
      <CommunityModuleShell
        backTo={`/community/${kind}/${id}`}
        backLabel={`Back to ${kind}`}
        comfortable
      >
        <main className="community-form-state" aria-busy="true">
          <p role="status">Loading publication…</p>
        </main>
      </CommunityModuleShell>
    );
  }
  if (publication && !publication.can_edit) {
    return <Navigate to={`/community/${kind}/${id}`} replace />;
  }

  const initialValues: Values = publication
    ? {
        slug: publication.slug,
        title: publication.title,
        summary: publication.summary,
        visibility: publication.visibility,
        media: publication.showcase?.media?.join("\n") ?? "",
        credits: publication.showcase?.credits ?? "",
        starts_at: localDateTime(publication.event?.starts_at),
        ends_at: localDateTime(publication.event?.ends_at),
        location: publication.event?.location ?? "",
        capacity: publication.event?.capacity ? String(publication.event.capacity) : "",
        publication_status: publication.publication_status,
      }
    : emptyValues;

  return (
    <CommunityModuleShell backTo={`/community/${kind}`} backLabel={`Back to ${kind}s`} comfortable>
      <ManagedForm<Values>
        id={editing ? "community-edit" : "community-create"}
        title={`${editing ? "Edit" : "Create"} ${kind}`}
        description="Publish through the shared community lifecycle and custom-page document builder."
        cancelTo={editing ? `/community/${kind}/${id}` : `/community/${kind}`}
        submitLabel={`${editing ? "Save" : "Create"} ${kind}`}
        initialValues={initialValues}
        enableReinitialize
        validate={values => {
          const errors: Partial<Record<keyof Values, string>> = {};
          if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(values.slug))
            errors.slug = "Use lowercase words separated by hyphens";
          if (values.title.trim().length < 3) errors.title = "Title is required";
          if (kind === "event" && !values.starts_at) errors.starts_at = "Start time is required";
          return errors;
        }}
        onSubmit={async (values, helpers) => {
          helpers.setStatus(undefined);
          try {
            const payload = {
              ...values,
              body: editing ? undefined : "[]",
              publication_status: editing ? values.publication_status : "draft",
              media:
                kind === "showcase"
                  ? values.media
                      .split("\n")
                      .map(value => value.trim())
                      .filter(Boolean)
                  : undefined,
              starts_at: kind === "event" ? new Date(values.starts_at).toISOString() : undefined,
              ends_at:
                kind === "event" && values.ends_at
                  ? new Date(values.ends_at).toISOString()
                  : undefined,
              capacity: kind === "event" && values.capacity ? Number(values.capacity) : undefined,
            };
            const created = await apiRequest<{ id: number }>(
              editing ? `/community/${kind}/${id}` : `/community/${kind}`,
              {
                method: editing ? "PUT" : "POST",
                body: JSON.stringify(payload),
              }
            );
            navigate(`/community/${kind}/${created.id}`);
          } catch (caught) {
            helpers.setStatus(caught instanceof Error ? caught.message : "Creation failed");
          }
        }}
      >
        <FormField name="title" label="Title" maxLength={160} autoFocus />
        <FormField name="slug" label="URL slug" maxLength={100} />
        <FormField name="summary" label="Summary" as="textarea" rows={3} maxLength={500} />
        <p className="community-form__page-note">
          Creating this {kind} also creates its owned custom page and discussion thread. You can
          build the page and edit the thread after creation.
        </p>
        <FormSelect
          name="visibility"
          label="Visibility"
          options={[
            { value: "public", label: "Public" },
            { value: "members", label: "Members" },
            { value: "private", label: "Private" },
          ]}
        />
        {editing && (
          <FormSelect
            name="publication_status"
            label="Publication status"
            options={[
              { value: "draft", label: "Draft" },
              { value: "published", label: "Published" },
              { value: "archived", label: "Archived" },
            ]}
          />
        )}
        {kind === "showcase" && (
          <>
            <FormField
              name="media"
              label="Media URLs"
              help="One URL per line; the shared media viewer handles previews."
              as="textarea"
              rows={4}
            />
            <FormField name="credits" label="Credits" maxLength={500} />
          </>
        )}
        {kind === "event" && (
          <>
            <FormField name="starts_at" label="Starts" type="datetime-local" />
            <FormField name="ends_at" label="Ends" type="datetime-local" />
            <FormField name="location" label="Location" maxLength={200} />
            <FormField name="capacity" label="Capacity" type="number" min={1} />
          </>
        )}
      </ManagedForm>
    </CommunityModuleShell>
  );
}
