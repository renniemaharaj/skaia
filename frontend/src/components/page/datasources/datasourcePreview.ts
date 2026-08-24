import { apiRequest } from "../../../utils/api";

export interface DataSourceDiagnostic {
  file: string;
  line: number;
  col: number;
  message: string;
  category: number;
}

export interface DataSourceFetchLogEntry {
  url: string;
  method: string;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  duration?: number;
  error?: string;
}

export interface DataSourcePreviewResult {
  js?: string;
  diagnostics: DataSourceDiagnostic[];
  data: unknown[] | null;
  error?: string;
  fetch_log?: DataSourceFetchLogEntry[];
}

export function runDatasourcePreview(files: Record<string, string>, envData: string) {
  return apiRequest<DataSourcePreviewResult>("/config/datasources/preview", {
    method: "POST",
    body: JSON.stringify({ files, env_data: envData }),
  });
}
