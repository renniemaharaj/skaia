export interface LegalPolicy {
  id: string;
  name: string;
  description: string;
  page_id: number;
  page_slug: string;
  created_at: string;
}

export interface LegalConfig {
  policies: LegalPolicy[];
  cookie_policy_ids: string[];
  checkout_policy_ids: string[];
  checkout_notice_variant: "standard" | "info" | "attention";
  checkout_notice_message: string;
  checkout_policy_checkbox_text: string;
}
