import { useState } from "react";

export interface UploadFilesOptions {
  acceptedExtensions: string[];
  maxFileSizeInMB?: number;
}

export interface UploadFilesResult {
  files: File[];
  errors: string[];
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  resetFiles: () => void;
}

export const useUploadFiles = ({
  acceptedExtensions,
  maxFileSizeInMB = 5,
}: UploadFilesOptions): UploadFilesResult => {
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = event.target.files;
    if (!newFiles) return;

    const validFiles: File[] = [];
    const errorMessages: string[] = [];

    Array.from(newFiles).forEach((file) => {
      const fileExtension = file.name.split(".").pop()?.toLowerCase();
      const isAccepted =
        fileExtension && acceptedExtensions.includes(fileExtension);

      const isSizeValid = file.size <= maxFileSizeInMB * 1024 * 1024;
      const isDuplicate = files.some(
        (existingFile) =>
          existingFile.name === file.name && existingFile.size === file.size,
      );

      if (isDuplicate) return;

      if (!isAccepted) {
        errorMessages.push(
          `${file.name} has an unsupported file extension. Accepted extensions: ${acceptedExtensions.join(", ")}.`,
        );
      } else if (!isSizeValid) {
        errorMessages.push(
          `${file.name} exceeds the size limit of ${maxFileSizeInMB}MB.`,
        );
      } else {
        validFiles.push(file);
      }
    });

    setFiles((prevFiles) => [...prevFiles, ...validFiles]);
    setErrors(errorMessages);

    if (event.target) {
      event.target.value = "";
    }
  };

  const resetFiles = () => {
    setFiles([]);
    setErrors([]);
  };

  return { files, errors, handleFileChange, resetFiles };
};
