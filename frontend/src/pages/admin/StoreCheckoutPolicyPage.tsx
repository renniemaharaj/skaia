import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FormField, FormSelect, ManagedForm } from "../../components/form";
import Checkbox from "../../components/ui/Checkbox";
import { ModulePageShell } from "../../components/layout/ModulePageShell";
import type { LegalConfig } from "../../types/legal";
import { apiRequest } from "../../utils/api";
import "./LegalPolicyForms.css";

interface Values {
  policy_ids: string[];
  notice_variant: LegalConfig["checkout_notice_variant"];
  notice_message: string;
  checkbox_text: string;
}

export default function StoreCheckoutPolicyPage() {
  const [config, setConfig] = useState<LegalConfig | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    apiRequest<LegalConfig>("/config/legal/manifest")
      .then(value => {
        setConfig(value);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, []);

  return (
    <ModulePageShell backTo="/store" backLabel="Back to store" width="comfortable">
      {loadError ? (
        <p role="alert">Store policy configuration could not be loaded.</p>
      ) : !config ? (
        <p role="status">Loading store policies…</p>
      ) : (
        <ManagedForm<Values>
          id="store-checkout-policies"
          className="legal-policy-form"
          eyebrow="STORE CHECKOUT"
          title="Checkout policy notice"
          description="Choose the required policy pages and customize how their acceptance notice appears at payment."
          icon={<ShieldCheck size={18} />}
          cancelTo="/store"
          submitLabel="Save policies"
          enableReinitialize
          initialValues={{
            policy_ids: config.checkout_policy_ids ?? [],
            notice_variant: config.checkout_notice_variant ?? "standard",
            notice_message:
              config.checkout_notice_message ??
              "Review and accept each policy before submitting your order. This browser remembers your choices.",
            checkbox_text: config.checkout_policy_checkbox_text ?? "I accept {policy}",
          }}
          validate={values => {
            const errors: Partial<Record<keyof Values, string>> = {};
            if (!values.notice_message.trim()) errors.notice_message = "Policy message is required";
            if (values.notice_message.trim().length > 500)
              errors.notice_message = "Use 500 characters or fewer";
            if (!values.checkbox_text.trim()) errors.checkbox_text = "Checkbox text is required";
            if (values.checkbox_text.trim().length > 200)
              errors.checkbox_text = "Use 200 characters or fewer";
            return errors;
          }}
          onSubmit={async (values, helpers) => {
            helpers.setStatus(undefined);
            try {
              const saved = await apiRequest<LegalConfig>("/config/legal/checkout", {
                method: "PUT",
                body: JSON.stringify({
                  policy_ids: values.policy_ids,
                  notice_variant: values.notice_variant,
                  notice_message: values.notice_message.trim(),
                  checkbox_text: values.checkbox_text.trim(),
                }),
              });
              setConfig(saved);
              helpers.resetForm({
                values: {
                  policy_ids: saved.checkout_policy_ids ?? [],
                  notice_variant: saved.checkout_notice_variant,
                  notice_message: saved.checkout_notice_message,
                  checkbox_text: saved.checkout_policy_checkbox_text,
                },
              });
            } catch (caught) {
              helpers.setStatus(
                caught instanceof Error ? caught.message : "Policies could not be saved"
              );
            }
          }}
        >
          {formik => (
            <>
              <FormSelect
                name="notice_variant"
                label="Message style"
                block
                options={[
                  { value: "standard", label: "Standard" },
                  { value: "info", label: "Information" },
                  { value: "attention", label: "Attention" },
                ]}
              />
              <FormField
                name="notice_message"
                label="Policy message"
                as="textarea"
                rows={3}
                maxLength={500}
              />
              <FormField
                name="checkbox_text"
                label="Acceptance checkbox text"
                help="Use {policy} where the linked policy name should appear."
                maxLength={200}
              />
              {config.policies.length === 0 ? (
                <p>
                  No policy pages are available. A site manager can create one from{" "}
                  <Link to="/form/site/legal">Site policies</Link>.
                </p>
              ) : (
                config.policies.map(policy => {
                  const checked = formik.values.policy_ids.includes(policy.id);
                  return (
                    <Checkbox
                      key={policy.id}
                      checked={checked}
                      label={policy.name}
                      description={policy.description || `Page: /page/${policy.page_slug}`}
                      onChange={event => {
                        const next = event.target.checked
                          ? [...formik.values.policy_ids, policy.id]
                          : formik.values.policy_ids.filter(id => id !== policy.id);
                        void formik.setFieldValue("policy_ids", next);
                      }}
                    />
                  );
                })
              )}
            </>
          )}
        </ManagedForm>
      )}
    </ModulePageShell>
  );
}
