import { useNavigate } from "react-router-dom";
import { apiRequest } from "../../utils/api";
import { FormField, ManagedForm } from "../form";
import "../forum/IconButton.css";

interface StoreCategoryValues {
  name: string;
  description: string;
  display_order: number;
}

export const NewStoreCategory = () => {
  const navigate = useNavigate();

  return (
    <ManagedForm<StoreCategoryValues>
      id="store-category-form"
      title="New Store Category"
      eyebrow="Store"
      description="Add a category to organize your products"
      initialValues={{ name: "", description: "", display_order: 0 }}
      onCancel={() => navigate("/store")}
      submitLabel="Create category"
      submitDisabled={formik => !formik.values.name.trim()}
      validate={values => (values.name.trim() ? {} : { name: "Category name is required" })}
      onSubmit={async (values, helpers) => {
        helpers.setStatus(undefined);
        try {
          await apiRequest("/store/categories", {
            method: "POST",
            body: JSON.stringify({
              ...values,
              name: values.name.trim(),
              display_order: Number(values.display_order),
            }),
          });
          navigate("/store");
        } catch (error) {
          helpers.setStatus(error instanceof Error ? error.message : "Failed to create category");
        }
      }}
    >
      <FormField
        name="name"
        label="Name"
        help="Use a concise storefront category name."
        placeholder="Ranks"
        maxLength={255}
        autoFocus
        required
      />
      <FormField
        name="description"
        label="Description"
        placeholder="Optional short description"
        maxLength={1000}
      />
      <FormField name="display_order" label="Display order" type="number" min={0} />
    </ManagedForm>
  );
};
