import { Form, Formik, type FormikConfig, type FormikProps, type FormikValues } from "formik";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import FormHeaderActions from "../ui/FormHeaderActions";
import "./ManagedForm.css";

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
  initialValues: Values;
  onSubmit: FormikConfig<Values>["onSubmit"];
  validate?: FormikConfig<Values>["validate"];
  validationSchema?: FormikConfig<Values>["validationSchema"];
  enableReinitialize?: boolean;
  validateOnMount?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
  submitDisabled?: boolean | ((formik: FormikProps<Values>) => boolean);
  className?: string;
  formClassName?: string;
  tabs?: ManagedFormTab[];
  tabsLabel?: string;
  children: ReactNode | ((formik: FormikProps<Values>) => ReactNode);
}

type ManagedFormProps<Values extends FormikValues> = ManagedFormBaseProps<Values> &
  ({ cancelTo: string; onCancel?: never } | { cancelTo?: never; onCancel: () => void });

/**
 * The standard Skaia editor form. Formik owns submission state and validation;
 * the only primary form actions are the header cancel and confirm controls.
 */
export default function ManagedForm<Values extends FormikValues>({
  id,
  title,
  eyebrow = "FORM",
  description,
  initialValues,
  onSubmit,
  validate,
  validationSchema,
  enableReinitialize = false,
  validateOnMount = false,
  submitLabel = "Save",
  cancelLabel = "Cancel",
  submitDisabled = false,
  className = "",
  formClassName = "",
  tabs = [],
  tabsLabel = "Form sections",
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

        return (
          <main className={`managed-form modal${className ? ` ${className}` : ""}`}>
            <header className="managed-form__header modal-header">
              <div className="modal-title-wrapper">
                <span className="managed-form__eyebrow">{eyebrow}</span>
                <h2>{title}</h2>
                {description && <p className="managed-form__description">{description}</p>}
              </div>
              {cancelTo ? (
                <FormHeaderActions
                  formId={id}
                  cancelTo={cancelTo}
                  saving={formik.isSubmitting}
                  confirmDisabled={!formik.isValid || isSubmitDisabled}
                  cancelLabel={cancelLabel}
                  confirmLabel={submitLabel}
                />
              ) : (
                <FormHeaderActions
                  formId={id}
                  onCancel={onCancel!}
                  saving={formik.isSubmitting}
                  confirmDisabled={!formik.isValid || isSubmitDisabled}
                  cancelLabel={cancelLabel}
                  confirmLabel={submitLabel}
                />
              )}
            </header>

            {tabs.length > 0 && (
              <nav className="managed-form__tabs" aria-label={tabsLabel}>
                {tabs.map(tab =>
                  tab.to ? (
                    <Link
                      key={tab.id}
                      to={tab.to}
                      className={tab.active ? "active" : undefined}
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
                      className={tab.active ? "active" : undefined}
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
            </Form>
          </main>
        );
      }}
    </Formik>
  );
}
