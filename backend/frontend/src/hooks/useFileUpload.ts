import { useCallback } from "react";

const API_BASE_URL =
  window.location.hostname === "localhost"
    ? import.meta.env.VITE_API_BASE_URL || "http://localhost:1080"
    : "";

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

/**
 * Hook for handling file uploads (photos and banners)
 */
export const useFileUpload = () => {
  /**
   * Upload user profile photo (avatar)
   */
  const uploadProfilePhoto = useCallback(
    async (file: File, onProgress?: (progress: UploadProgress) => void) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "profile");

      try {
        const xhr = new XMLHttpRequest();

        // Track progress
        if (onProgress) {
          xhr.upload.addEventListener("progress", (event) => {
            if (event.lengthComputable) {
              onProgress({
                loaded: event.loaded,
                total: event.total,
                percentage: Math.round((event.loaded / event.total) * 100),
              });
            }
          });
        }

        return new Promise<string>((resolve, reject) => {
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              const response = JSON.parse(xhr.responseText);
              resolve(response.url);
            } else {
              reject(new Error(`Upload failed: ${xhr.statusText}`));
            }
          };

          xhr.onerror = () => {
            reject(new Error("Upload failed"));
          };

          // Get auth token
          const token = localStorage.getItem("auth.accessToken");
          if (token) {
            xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          }

          xhr.open("POST", `${API_BASE_URL}/users/upload-photo`);
          xhr.send(formData);
        });
      } catch (err) {
        throw err instanceof Error ? err : new Error("Upload failed");
      }
    },
    [],
  );

  /**
   * Upload thread banner (350px height)
   */
  const uploadThreadBanner = useCallback(
    async (file: File, onProgress?: (progress: UploadProgress) => void) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("type", "banner");

      try {
        const xhr = new XMLHttpRequest();

        // Track progress
        if (onProgress) {
          xhr.upload.addEventListener("progress", (event) => {
            if (event.lengthComputable) {
              onProgress({
                loaded: event.loaded,
                total: event.total,
                percentage: Math.round((event.loaded / event.total) * 100),
              });
            }
          });
        }

        return new Promise<string>((resolve, reject) => {
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              const response = JSON.parse(xhr.responseText);
              resolve(response.url);
            } else {
              reject(new Error(`Upload failed: ${xhr.statusText}`));
            }
          };

          xhr.onerror = () => {
            reject(new Error("Upload failed"));
          };

          // Get auth token
          const token = localStorage.getItem("auth.accessToken");
          if (token) {
            xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          }

          xhr.open("POST", `${API_BASE_URL}/users/upload-banner`);
          xhr.send(formData);
        });
      } catch (err) {
        throw err instanceof Error ? err : new Error("Upload failed");
      }
    },
    [],
  );

  /**
   * Validate image file
   */
  const validateImageFile = useCallback(
    (file: File, maxSizeMB: number = 5): string | null => {
      const validMimeTypes = ["image/jpeg", "image/png", "image/webp"];

      if (!validMimeTypes.includes(file.type)) {
        return "Only JPEG, PNG, and WebP images are allowed";
      }

      if (file.size > maxSizeMB * 1024 * 1024) {
        return `File size must be less than ${maxSizeMB}MB`;
      }

      return null;
    },
    [],
  );

  /**
   * Validate banner dimensions
   */
  const validateBannerDimensions = useCallback(
    (
      file: File,
      callback: (isValid: boolean, errorMessage?: string) => void,
    ) => {
      const reader = new FileReader();

      reader.onload = (event) => {
        const img = new Image();

        img.onload = () => {
          if (img.height !== 350) {
            callback(
              false,
              `Banner height must be exactly 350px. Current height: ${img.height}px`,
            );
          } else {
            callback(true);
          }
        };

        img.onerror = () => {
          callback(false, "Failed to load image");
        };

        img.src = event.target?.result as string;
      };

      reader.readAsDataURL(file);
    },
    [],
  );

  return {
    uploadProfilePhoto,
    uploadThreadBanner,
    validateImageFile,
    validateBannerDimensions,
  };
};
