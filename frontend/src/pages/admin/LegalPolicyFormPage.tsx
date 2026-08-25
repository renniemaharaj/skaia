import { useNavigate } from "react-router-dom";
import { FormCheckbox, FormField, ManagedForm } from "../../components/form";
import { ModulePageShell } from "../../components/layout/ModulePageShell";
import type { PageBuilderDoc } from "../../hooks/usePageData";
import type { LegalConfig, LegalPolicy } from "../../types/legal";
import { apiRequest } from "../../utils/api";
import "./LegalPolicyForms.css";

interface Values {
  name: string;
  description: string;
  cookie_notice: boolean;
  footer_link: boolean;
}

const initialValues: Values = {
  name: "",
  description: "",
  cookie_notice: false,
  footer_link: false,
};

export default function LegalPolicyFormPage() {
  const navigate = useNavigate();

  return (
    <ModulePageShell
      backTo="/form/site/legal"
      backLabel="Back to Site policies"
      width="comfortable"
    >
      <ManagedForm<Values>
        id="legal-policy-create"
        className="legal-policy-form"
        eyebrow="SITE POLICIES"
        title="Add policy"
        description="This creates a public custom page that you can edit with the standard page builder."
        cancelTo="/form/site/legal"
        submitLabel="Create policy"
        submittingLabel="Creating policy"
        initialValues={initialValues}
        validate={values => {
          const errors: Partial<Record<keyof Values, string>> = {};
          const name = values.name.trim();
          if (name.length < 2) errors.name = "Policy name is required";
          if (name.length > 160) errors.name = "Use 160 characters or fewer";
          if (values.description.trim().length > 1000) {
            errors.description = "Use 1,000 characters or fewer";
          }
          return errors;
        }}
        onSubmit={async (values, helpers) => {
          helpers.setStatus(undefined);
          let page: PageBuilderDoc | null = null;
          try {
            const id = crypto.randomUUID();
            const slug = legalSlug(values.name, id);
            page = await apiRequest<PageBuilderDoc>("/pages", {
              method: "POST",
              body: JSON.stringify({
                slug,
                title: values.name.trim(),
                description: values.description.trim(),
                visibility: "public",
                content: "[]",
              }),
            });
            const current = await apiRequest<LegalConfig>("/config/legal");
            const config = {
              ...current,
              policies: current.policies ?? [],
              cookie_policy_ids: current.cookie_policy_ids ?? [],
              footer_policy_ids: current.footer_policy_ids ?? [],
              checkout_policy_ids: current.checkout_policy_ids ?? [],
            };
            const policy: LegalPolicy = {
              id,
              name: values.name.trim(),
              description: values.description.trim(),
              page_id: page.id,
              page_slug: page.slug,
              created_at: page.created_at,
            };
            await apiRequest<LegalConfig>("/config/legal", {
              method: "PUT",
              body: JSON.stringify({
                ...config,
                policies: [...config.policies, policy],
                cookie_policy_ids: values.cookie_notice
                  ? [...config.cookie_policy_ids, policy.id]
                  : config.cookie_policy_ids,
                footer_policy_ids: values.footer_link
                  ? [...config.footer_policy_ids, policy.id]
                  : config.footer_policy_ids,
              }),
            });
            navigate(`/page/${page.slug}`);
          } catch (caught) {
            if (page) {
              try {
                await apiRequest(`/pages/${page.id}`, { method: "DELETE" });
              } catch {
                // The page remains recoverable in Trash if cleanup cannot complete.
              }
            }
            helpers.setStatus(caught instanceof Error ? caught.message : "Policy creation failed");
          }
        }}
      >
        <FormField name="name" label="Policy name" maxLength={160} autoFocus />
        <FormField
          name="description"
          label="Description"
          help="A short operator-facing summary. The policy itself belongs on the custom page."
          as="textarea"
          rows={4}
          maxLength={1000}
        />
        <FormCheckbox
          name="cookie_notice"
          label="Show this policy in the cookie notice"
          description="Visitors can accept it from the shared site banner."
        />
        <FormCheckbox
          name="footer_link"
          label="Show this policy in the footer"
          description="Visitors can open it from the shared site footer."
        />
      </ManagedForm>
    </ModulePageShell>
  );
}

function legalSlug(name: string, id: string) {
  const words = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `legal-${words || "policy"}-${id.slice(0, 8).toLowerCase()}`;
}
