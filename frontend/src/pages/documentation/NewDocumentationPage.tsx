import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { Documentation } from "../../atoms/documentation";
import { FormField, ManagedForm } from "../../components/form";
import { apiRequest } from "../../utils/api";
import "../../components/documentation/DocumentationShell.css";

interface DocumentationValues {
  title: string;
  slug: string;
  description: string;
}

export default function NewDocumentationPage() {
  const navigate = useNavigate();

  return (
    <ManagedForm<DocumentationValues>
      id="new-documentation-form"
      title="Create Documentation"
      eyebrow="Documentation"
      description="Start a separate collection of guides for this site."
      initialValues={{ title: "", slug: "", description: "" }}
      onCancel={() => navigate("/doc")}
      submitLabel="Create documentation"
      submitDisabled={formik => !formik.values.title.trim() || !formik.values.slug.trim()}
      validate={values => ({
        ...(!values.title.trim() ? { title: "Display name is required" } : {}),
        ...(!values.slug.trim() ? { slug: "URL slug is required" } : {}),
      })}
      onSubmit={async (values, helpers) => {
        helpers.setStatus(undefined);
        try {
          const created = await apiRequest<Documentation>("/docs/", {
            method: "POST",
            body: JSON.stringify({ ...values, visibility: "public" }),
          });
          toast.success("Documentation created");
          navigate(`/doc/${created.slug}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to create documentation";
          helpers.setStatus(message);
          toast.error(message);
        }
      }}
    >
      {formik => (
        <>
          <FormField
            name="title"
            label="Display name"
            help="Name this documentation collection for readers."
            placeholder="Platform documentation"
            maxLength={255}
            autoFocus
            required
          />
          <FormField
            name="slug"
            label="URL slug"
            help={`Published at /doc/${formik.values.slug || "platform"}`}
            placeholder="platform"
            maxLength={120}
            required
          />
          <FormField
            as="textarea"
            name="description"
            label="Description"
            help="Summarize the purpose of this documentation collection."
            placeholder="Guides and reference material for the platform."
            rows={4}
            maxLength={2000}
          />
        </>
      )}
    </ManagedForm>
  );
}
