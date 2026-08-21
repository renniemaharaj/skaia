import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Product, StoreCategory } from "../../atoms/store";
import { apiRequest } from "../../utils/api";
import { EditProductForm } from "./EditProductForm";

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
      <div className="card" role="alert">
        {error}
      </div>
    );
  if (!product) return <div className="card">Loading product editor...</div>;
  const returnTo = `/store/product/${product.id}`;
  return (
    <EditProductForm
      product={product}
      categories={categories}
      cancelTo={returnTo}
      onSuccess={() => navigate(returnTo)}
    />
  );
}
