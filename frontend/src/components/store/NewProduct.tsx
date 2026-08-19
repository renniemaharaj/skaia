import { useAtom } from "jotai";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type ProductMedia, productCategoriesAtom } from "../../atoms/store";
import { apiRequest } from "../../utils/api";
import { FormCheckbox, FormField, FormSelect, ManagedForm } from "../form";
import Select from "../input/Select";
import { ProductMediaTable } from "./ProductMediaTable";
import "../forum/IconButton.css";

interface SpecialAction {
  type: string;
  value: string;
}

interface ProductValues {
  category_id: string;
  name: string;
  description: string;
  price: string;
  stock: string;
  stock_unlimited: boolean;
  image_url: string;
  media: ProductMedia[];
  is_active: boolean;
  special_actions: SpecialAction[];
}

interface StoreRole {
  name: string;
}

export const NewProduct = () => {
  const navigate = useNavigate();
  const [categories, setCategories] = useAtom(productCategoriesAtom);
  const [availableRoles, setAvailableRoles] = useState<StoreRole[]>([]);

  useEffect(() => {
    void apiRequest("/store/categories")
      .then(response => setCategories(Array.isArray(response) ? response : []))
      .catch(error => console.error("Failed to load categories:", error));
    void apiRequest("/users/roles")
      .then(response => setAvailableRoles(Array.isArray(response) ? response : []))
      .catch(error => console.error("Failed to load roles:", error));
  }, [setCategories]);

  return (
    <ManagedForm<ProductValues>
      id="new-product-form"
      title="New Product"
      eyebrow="Store"
      description="Add a product to your store"
      initialValues={{
        category_id: "",
        name: "",
        description: "",
        price: "",
        stock: "0",
        stock_unlimited: false,
        image_url: "",
        media: [],
        is_active: true,
        special_actions: [],
      }}
      cancelTo="/store"
      submitLabel="Create product"
      submitDisabled={formik =>
        !formik.values.name.trim() || !formik.values.category_id || !formik.values.price
      }
      validate={values => {
        const price = Number.parseFloat(values.price);
        return {
          ...(!values.name.trim() ? { name: "Product name is required" } : {}),
          ...(!values.category_id ? { category_id: "Category is required" } : {}),
          ...(Number.isNaN(price) || price < 0 ? { price: "Enter a valid price" } : {}),
        };
      }}
      onSubmit={async (values, helpers) => {
        helpers.setStatus(undefined);
        try {
          await apiRequest("/store/products", {
            method: "POST",
            body: JSON.stringify({
              category_id: Number(values.category_id),
              name: values.name.trim(),
              description: values.description,
              price: Number.parseFloat(values.price),
              stock: Number(values.stock),
              stock_unlimited: values.stock_unlimited,
              image_url: values.media[0]?.url ?? values.image_url,
              media: values.media,
              is_active: values.is_active,
              special_actions: JSON.stringify(
                values.special_actions.filter(action => action.value !== "")
              ),
            }),
          });
          navigate("/store");
        } catch (error) {
          helpers.setStatus(error instanceof Error ? error.message : "Failed to create product");
        }
      }}
    >
      {formik => (
        <>
          <FormSelect
            name="category_id"
            label="Category"
            block
            options={[
              { value: "", label: "Select a category", disabled: true },
              ...categories.map(category => ({
                value: String(category.id),
                label: category.name,
              })),
            ]}
          />
          <FormField
            name="name"
            label="Name"
            help="Use the product name customers should see."
            placeholder="Diamond Rank"
            maxLength={255}
            autoFocus
            required
          />
          <FormField
            as="textarea"
            name="description"
            label="Description"
            placeholder="What does this product include?"
            rows={3}
          />
          <div className="managed-form__grid">
            <FormField
              name="price"
              label="Price (USD)"
              type="number"
              step="0.01"
              min="0"
              placeholder="9.99"
              required
            />
            <FormField
              name="stock"
              label="Stock"
              type="number"
              min="0"
              disabled={formik.values.stock_unlimited}
            />
          </div>
          <FormCheckbox
            name="stock_unlimited"
            label="Unlimited stock"
            description="Always show this product as in stock."
          />
          <div className="form-group">
            <label className="form-label">Marketing media</label>
            <p className="form-help">The first image is used as the primary product image.</p>
            <ProductMediaTable
              media={formik.values.media}
              editable
              onChange={media => {
                void formik.setFieldValue("media", media);
                void formik.setFieldValue("image_url", media[0]?.url ?? "");
              }}
            />
          </div>
          <FormCheckbox
            name="is_active"
            label="Active"
            description="Make this product visible to customers."
          />
          <div className="form-group store-special-actions">
            <label className="form-label">Special actions on purchase</label>
            <p className="form-help">Add digital assets or perks delivered after purchase.</p>
            {formik.values.special_actions.map((action, index) => (
              <div key={`${action.type}-${index}`} className="store-special-action-row">
                <Select
                  size="sm"
                  aria-label={`Action ${index + 1} type`}
                  value={action.type}
                  options={[
                    { value: "role", label: "Assign Role" },
                    { value: "credit", label: "Give Store Credit (cents)" },
                  ]}
                  onChange={event => {
                    const actions = [...formik.values.special_actions];
                    actions[index] = { type: event.target.value, value: "" };
                    void formik.setFieldValue("special_actions", actions);
                  }}
                />
                {action.type === "role" ? (
                  <Select
                    size="sm"
                    aria-label={`Action ${index + 1} role`}
                    value={action.value}
                    options={[
                      { value: "", label: "Select Role..." },
                      ...availableRoles.map(role => ({ value: role.name, label: role.name })),
                    ]}
                    onChange={event => {
                      const actions = [...formik.values.special_actions];
                      actions[index] = { ...action, value: event.target.value };
                      void formik.setFieldValue("special_actions", actions);
                    }}
                  />
                ) : (
                  <input
                    type="number"
                    className="form-input form-input--sm"
                    aria-label={`Action ${index + 1} credit amount`}
                    placeholder="Amount in cents"
                    value={action.value}
                    onChange={event => {
                      const actions = [...formik.values.special_actions];
                      actions[index] = { ...action, value: event.target.value };
                      void formik.setFieldValue("special_actions", actions);
                    }}
                  />
                )}
                <button
                  type="button"
                  className="btn-admin-icon"
                  aria-label={`Remove action ${index + 1}`}
                  onClick={() =>
                    void formik.setFieldValue(
                      "special_actions",
                      formik.values.special_actions.filter(
                        (_, actionIndex) => actionIndex !== index
                      )
                    )
                  }
                >
                  <X size={18} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                void formik.setFieldValue("special_actions", [
                  ...formik.values.special_actions,
                  { type: "role", value: "" },
                ])
              }
            >
              + Add action
            </button>
          </div>
        </>
      )}
    </ManagedForm>
  );
};
