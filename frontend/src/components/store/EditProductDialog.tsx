import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Product, ProductMedia, StoreCategory } from "../../atoms/store";
import { apiRequest } from "../../utils/api";
import { centsToDollars } from "../../utils/money";
import { FormCheckbox, FormField, FormSelect, ManagedForm } from "../form";
import Button from "../input/Button";
import Select from "../input/Select";
import { ProductMediaTable } from "./ProductMediaTable";
import "../forum/IconButton.css";

interface EditProductDialogProps {
  isOpen: boolean;
  product: Product;
  categories: StoreCategory[];
  onClose: () => void;
  onSuccess?: () => void;
}

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

function productValues(product: Product): ProductValues {
  let specialActions: SpecialAction[] = [];
  try {
    specialActions = product.special_actions ? JSON.parse(product.special_actions) : [];
  } catch {
    specialActions = [];
  }
  return {
    category_id: String(product.category_id),
    name: product.name,
    description: product.description,
    price: centsToDollars(product.price ?? 0).toFixed(2),
    stock: String(product.stock),
    stock_unlimited: product.stock_unlimited ?? false,
    image_url: product.image_url ?? "",
    media: (product.media ?? []) as ProductMedia[],
    is_active: product.is_active,
    special_actions: specialActions,
  };
}

export const EditProductDialog = ({
  isOpen,
  product,
  categories,
  onClose,
  onSuccess,
}: EditProductDialogProps) => {
  const [availableRoles, setAvailableRoles] = useState<{ name: string }[]>([]);
  useEffect(() => {
    void apiRequest("/users/roles").then(response =>
      setAvailableRoles(Array.isArray(response) ? response : [])
    );
  }, []);
  if (!isOpen) return null;

  return createPortal(
    <div className="managed-form-overlay" onClick={onClose}>
      <div onClick={event => event.stopPropagation()}>
        <ManagedForm<ProductValues>
          id="edit-product-form"
          title="Edit Product"
          eyebrow="Store"
          description={`Update ${product.name}`}
          initialValues={productValues(product)}
          enableReinitialize
          onCancel={onClose}
          submitLabel="Save product"
          submitDisabled={formik => !formik.values.name.trim() || !formik.values.category_id}
          validate={values => ({
            ...(!values.name.trim() ? { name: "Product name is required" } : {}),
            ...(Number.isNaN(Number.parseFloat(values.price))
              ? { price: "Enter a valid price" }
              : {}),
          })}
          onSubmit={async (values, helpers) => {
            helpers.setStatus(undefined);
            try {
              await apiRequest(`/store/products/${product.id}`, {
                method: "PUT",
                body: JSON.stringify({
                  ...values,
                  category_id: Number(values.category_id),
                  price: Number.parseFloat(values.price),
                  stock: Number(values.stock),
                  image_url: values.media[0]?.url ?? values.image_url,
                  special_actions: JSON.stringify(
                    values.special_actions.filter(action => action.value)
                  ),
                }),
              });
              onSuccess?.();
              onClose();
            } catch (error) {
              helpers.setStatus(
                error instanceof Error ? error.message : "Failed to update product"
              );
            }
          }}
        >
          {formik => (
            <>
              <FormSelect
                name="category_id"
                label="Category"
                block
                options={categories.map(category => ({
                  value: String(category.id),
                  label: category.name,
                }))}
              />
              <FormField name="name" label="Name" required autoFocus />
              <FormField as="textarea" name="description" label="Description" rows={3} />
              <div className="managed-form__grid">
                <FormField
                  name="price"
                  label="Price (USD)"
                  type="number"
                  min="0"
                  step="0.01"
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
                <ProductMediaTable
                  media={formik.values.media}
                  editable
                  onChange={media => void formik.setFieldValue("media", media)}
                />
              </div>
              <FormCheckbox
                name="is_active"
                label="Active"
                description="Make this product visible to customers."
              />
              <div className="form-group store-special-actions">
                <label className="form-label">Special actions on purchase</label>
                {formik.values.special_actions.map((action, index) => (
                  <div key={`${action.type}-${index}`} className="store-special-action-row">
                    <Select
                      size="sm"
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
                        aria-label={`Action ${index + 1} amount`}
                        value={action.value}
                        onChange={event => {
                          const actions = [...formik.values.special_actions];
                          actions[index] = { ...action, value: event.target.value };
                          void formik.setFieldValue("special_actions", actions);
                        }}
                      />
                    )}
                    <Button
                      type="button"
                      variant="danger"
                      size="icon"
                      aria-label="Remove special action"
                      onClick={() =>
                        void formik.setFieldValue(
                          "special_actions",
                          formik.values.special_actions.filter(
                            (_, itemIndex) => itemIndex !== index
                          )
                        )
                      }
                    >
                      <X size={18} />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void formik.setFieldValue("special_actions", [
                      ...formik.values.special_actions,
                      { type: "role", value: "" },
                    ])
                  }
                >
                  + Add action
                </Button>
              </div>
            </>
          )}
        </ManagedForm>
      </div>
    </div>,
    document.body
  );
};
