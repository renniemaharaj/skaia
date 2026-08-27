import type { DataSourceFetchLogEntry } from "./datasourcePreview";

export interface DataSourcePreviewItem {
  heading?: string;
  subheading?: string;
  icon?: string;
  image_url?: string;
  link_url?: string;
  [key: string]: unknown;
}

export interface DataSourceRunStats {
  duration: number;
  exitReason: "success" | "compile_error" | "runtime_error" | "invalid_return" | "timeout";
  totalItems: number;
  validItems: number;
  skippedItems: number;
  fetchLog: DataSourceFetchLogEntry[];
}

export const DATA_SOURCE_EXIT_REASON_LABELS: Record<DataSourceRunStats["exitReason"], string> = {
  success: "Success",
  compile_error: "Compile Error",
  runtime_error: "Runtime Error",
  invalid_return: "Invalid Return",
  timeout: "Timeout",
};

export const DEFAULT_DATASOURCE_CODE = `// Return an array of items:
// { heading, subheading, icon?, image_url?, link_url? }
return [
 { heading: "Example", subheading: "Hello world" },
];
`;

export type DataSourcePreviewType = "component";

export const DATASOURCE_PREVIEW_TYPE_LABELS: Record<DataSourcePreviewType, string> = {
  component: "Component Registry",
};
