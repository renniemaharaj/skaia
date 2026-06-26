import type { Product, ProductMedia } from "../../atoms/store";

export const getProductMediaItems = (product: Product): ProductMedia[] =>
  product.media && product.media.length > 0
    ? product.media
    : product.image_url
      ? [
          {
            url: product.image_url,
            filename: product.image_url.split("/").pop() || product.name,
            mime_type: "",
            type: "image",
            size: 0,
            created_at: product.created_at,
          },
        ]
      : [];
