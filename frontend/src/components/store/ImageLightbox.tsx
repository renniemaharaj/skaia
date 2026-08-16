import { MediaPreviewLightbox } from "../ui/MediaPreviewLightbox";

interface ImageLightboxProps {
  imageUrl: string | null;
  onClose: () => void;
}

export function ImageLightbox({ imageUrl, onClose }: ImageLightboxProps) {
  if (!imageUrl) return null;

  return (
    <MediaPreviewLightbox
      items={[{ url: imageUrl, filename: "Preview", type: "image" }]}
      index={0}
      onClose={onClose}
    />
  );
}
