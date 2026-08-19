import { useNavigate } from "react-router-dom";
import { apiRequest } from "../../utils/api";
import { FormField, ManagedForm } from "../form";
import "./IconButton.css";

interface CategoryValues {
  name: string;
  description: string;
}

export const NewForumCategory = () => {
  const navigate = useNavigate();

  return (
    <ManagedForm<CategoryValues>
      id="forum-category-form"
      title="Create Category"
      eyebrow="Forum"
      description="Add a new forum category for discussions"
      initialValues={{ name: "", description: "" }}
      onCancel={() => navigate("/forum")}
      submitLabel="Create category"
      submitDisabled={formik => !formik.values.name.trim()}
      validate={values => (values.name.trim() ? {} : { name: "Category name is required" })}
      onSubmit={async (values, helpers) => {
        helpers.setStatus(undefined);
        try {
          await apiRequest("/forum/categories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: values.name.trim(),
              description: values.description,
              display_order: 0,
            }),
          });
          navigate("/forum");
        } catch (error) {
          helpers.setStatus(error instanceof Error ? error.message : "Failed to create category");
        }
      }}
    >
      <FormField
        name="name"
        label="Category name"
        help="Use a short name members will recognize."
        placeholder="General Discussion"
        maxLength={255}
        autoFocus
        required
      />
      <FormField
        as="textarea"
        name="description"
        label="Description"
        help="Optionally explain what belongs in this category."
        placeholder="Describe the category"
        rows={4}
      />
    </ManagedForm>
  );
};
