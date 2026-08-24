import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Product, StoreCategory } from "../../atoms/store";
import { apiRequest } from "../../utils/api";
import { EditProductForm } from "./EditProductForm";
import { StorePageShell } from "./StorePageShell";

export default function EditProductPage() {
  const { productId = "" } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void Promise.all([
      apiRequest<Product>(`/store/products/${productId}`),
      apiRequest<StoreCategory[]>("/store/categories"),
    ])
      .then(([nextProduct, nextCategories]) => {
        setProduct(nextProduct);
        setCategories(nextCategories ?? []);
      })
      .catch(cause => setError(cause instanceof Error ? cause.message : "Unable to edit product"));
  }, [productId]);

  if (error)
    return (
      <StorePageShell backTo="/store">
        <div className="card" role="alert">
          {error}
        </div>
      </StorePageShell>
    );
  if (!product)
    return (
      <StorePageShell backTo="/store">
        <div className="card">Loading product editor...</div>
      </StorePageShell>
    );
  const returnTo = `/store/product/${product.id}`;
  return (
    <StorePageShell backTo={returnTo} backLabel="Back to Product">
      <EditProductForm
        product={product}
        categories={categories}
        cancelTo={returnTo}
        onSuccess={() => navigate(returnTo)}
      />
    </StorePageShell>
  );
}
