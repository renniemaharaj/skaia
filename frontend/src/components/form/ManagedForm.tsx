import { Form, Formik, type FormikConfig, type FormikProps, type FormikValues } from "formik";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import Button from "../ui/Button";
import FormHeaderActions from "../ui/FormHeaderActions";
import FormSectionIntro from "./FormSectionIntro";

export interface ManagedFormTab {
  id: string;
  label: string;
  icon?: ReactNode;
  active: boolean;
  to?: string;
  onSelect?: () => void;
}

interface ManagedFormBaseProps<Values extends FormikValues> {
  id: string;
  title: string;
  eyebrow?: string;
  description?: string;
  icon?: ReactNode;
  initialValues: Values;
  onSubmit: FormikConfig<Values>["onSubmit"];
  validate?: FormikConfig<Values>["validate"];
  validationSchema?: FormikConfig<Values>["validationSchema"];
  enableReinitialize?: boolean;
  validateOnMount?: boolean;
  submitLabel?: string;
  submittingLabel?: string;
  cancelLabel?: string;
  submitDisabled?: boolean | ((formik: FormikProps<Values>) => boolean);
  className?: string;
  formClassName?: string;
  tabs?: ManagedFormTab[];
  tabsLabel?: string;
  variant?: "editor" | "grouped";
  afterActions?: ReactNode | ((formik: FormikProps<Values>) => ReactNode);
  children: ReactNode | ((formik: FormikProps<Values>) => ReactNode);
}

type CancelAction =
  | { cancelTo: string; onCancel?: never }
  | { cancelTo?: never; onCancel: () => void };

type ManagedFormProps<Values extends FormikValues> = ManagedFormBaseProps<Values> &
  (
    | ({ variant?: "editor" } & CancelAction)
    | { variant: "grouped"; cancelTo?: string; onCancel?: () => void }
  );

/**
 * The standard GWP form. Formik owns submission state and validation; routed
 * editors use header actions while grouped auth/access forms use footer actions.
 */
export default function ManagedForm<Values extends FormikValues>({
  id,
  title,
  eyebrow,
  description,
  icon,
  initialValues,
  onSubmit,
  validate,
  validationSchema,
  enableReinitialize = false,
  validateOnMount = false,
  submitLabel = "Save",
  submittingLabel,
  cancelLabel = "Cancel",
  submitDisabled = false,
  className = "",
  formClassName = "",
  tabs = [],
  tabsLabel = "Form sections",
  variant = "editor",
  afterActions,
  children,
  cancelTo,
  onCancel,
}: ManagedFormProps<Values>) {
  return (
    <Formik
      initialValues={initialValues}
      onSubmit={onSubmit}
      validate={validate}
      validationSchema={validationSchema}
      enableReinitialize={enableReinitialize}
      validateOnMount={validateOnMount}
    >
      {formik => {
        const isSubmitDisabled =
          typeof submitDisabled === "function" ? submitDisabled(formik) : submitDisabled;
        const confirmDisabled = !formik.isValid || isSubmitDisabled;
        const hasCancel = Boolean(cancelTo || onCancel);

        return (
          <main
            className={`managed-form managed-form--${variant} modal${
              className ? ` ${className}` : ""
            }`}
          >
            {variant === "grouped" ? (
              <header className="managed-form__grouped-header">
                <FormSectionIntro
                  icon={icon}
                  eyebrow={eyebrow}
                  title={title}
                  description={description ?? ""}
                />
              </header>
            ) : (
              <header className="managed-form__header modal-header">
                <div className="modal-title-wrapper">
                  <span className="managed-form__eyebrow">{eyebrow ?? "FORM"}</span>
                  <h2>{title}</h2>
                  {description && <p className="managed-form__description">{description}</p>}
                </div>
                {cancelTo ? (
                  <FormHeaderActions
                    formId={id}
                    cancelTo={cancelTo}
                    saving={formik.isSubmitting}
                    confirmDisabled={confirmDisabled}
                    cancelLabel={cancelLabel}
                    confirmLabel={submitLabel}
                  />
                ) : onCancel ? (
                  <FormHeaderActions
                    formId={id}
                    onCancel={onCancel}
                    saving={formik.isSubmitting}
                    confirmDisabled={confirmDisabled}
                    cancelLabel={cancelLabel}
                    confirmLabel={submitLabel}
                  />
                ) : null}
              </header>
            )}

            {tabs.length > 0 && (
              <nav className="managed-form__tabs" aria-label={tabsLabel}>
                {tabs.map(tab =>
                  tab.to ? (
                    <Link
                      key={tab.id}
                      to={tab.to}
                      className={`managed-form__tab${tab.active ? " active" : ""}`}
                      aria-current={tab.active ? "page" : undefined}
                    >
                      {tab.icon}
                      {tab.label}
                    </Link>
                  ) : (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={tab.active}
                      className={`managed-form__tab${tab.active ? " active" : ""}`}
                      onClick={tab.onSelect}
                    >
                      {tab.icon}
                      {tab.label}
                    </button>
                  )
                )}
              </nav>
            )}

            <Form
              id={id}
              className={`managed-form__body modal-form compact-form-card${
                formClassName ? ` ${formClassName}` : ""
              }`}
              noValidate
            >
              {typeof formik.status === "string" && (
                <div className="managed-form__error" role="alert">
                  {formik.status}
                </div>
              )}
              {typeof children === "function" ? children(formik) : children}
              {variant === "grouped" && (
                <div className="managed-form__footer-actions">
                  {hasCancel &&
                    (cancelTo ? (
                      <Link className="sk-btn sk-btn--secondary sk-btn--md" to={cancelTo}>
                        {cancelLabel}
                      </Link>
                    ) : (
                      <Button type="button" variant="secondary" onClick={onCancel}>
                        {cancelLabel}
                      </Button>
                    ))}
                  <Button
                    type="submit"
                    className="managed-form__submit"
                    variant="primary"
                    loading={formik.isSubmitting}
                    disabled={confirmDisabled}
                    block={!hasCancel}
                  >
                    {formik.isSubmitting ? (submittingLabel ?? submitLabel) : submitLabel}
                  </Button>
                </div>
              )}
              {typeof afterActions === "function" ? afterActions(formik) : afterActions}
            </Form>
          </main>
        );
      }}
    </Formik>
  );
}
