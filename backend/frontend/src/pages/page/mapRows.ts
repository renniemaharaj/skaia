/**
 * mapRows — transform datasource rows into LandingItem[] via a column map.
 *
 * Each row from the evaluated datasource becomes a LandingItem.
 * The column_map tells us which row field populates which LandingItem field.
 * Row overrides (per-row edits the user made to generated cards) are merged on top.
 */
import type {
  LandingItem,
  ColumnMap,
  RowOverrides,
  MappableField,
} from "./types";

export interface RawRow {
  [key: string]: unknown;
}

/**
 * Derive a stable key for a row. Uses `row_key_column` if provided,
 * otherwise falls back to the row index.
 */
export function rowKey(row: RawRow, index: number, keyColumn?: string): string {
  if (keyColumn && row[keyColumn] !== undefined && row[keyColumn] !== null) {
    return String(row[keyColumn]);
  }
  return String(index);
}

/**
 * Convert a single datasource row into a LandingItem using the column map.
 */
function mapSingleRow(
  row: RawRow,
  columnMap: ColumnMap,
  sectionId: number,
  index: number,
  override?: Partial<Record<MappableField, string>>,
): LandingItem {
  const item: LandingItem = {
    id: -(index + 1), // negative synthetic IDs so they don't collide with real DB items
    section_id: sectionId,
    display_order: index + 1,
    icon: "",
    heading: "",
    subheading: "",
    image_url: "",
    link_url: "",
    config: "{}",
  };

  // Apply column map: item[field] = row[columnName]
  for (const [field, colName] of Object.entries(columnMap)) {
    if (colName && row[colName] !== undefined && row[colName] !== null) {
      (item as unknown as Record<string, unknown>)[field] = String(
        row[colName],
      );
    }
  }

  // Apply per-row overrides on top
  if (override) {
    for (const [field, value] of Object.entries(override)) {
      if (value !== undefined && value !== null) {
        (item as unknown as Record<string, unknown>)[field] = value;
      }
    }
  }

  return item;
}

/**
 * Transform an array of datasource rows into LandingItem[] using column mapping.
 */
export function mapRowsToItems(
  rows: RawRow[],
  columnMap: ColumnMap,
  sectionId: number,
  rowOverrides?: RowOverrides,
  keyColumn?: string,
): LandingItem[] {
  return rows.map((row, i) => {
    const key = rowKey(row, i, keyColumn);
    const override = rowOverrides?.[key];
    return mapSingleRow(row, columnMap, sectionId, i, override);
  });
}

/**
 * Detect available column names from evaluated rows.
 */
export function detectColumns(rows: RawRow[]): string[] {
  const keys = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      keys.add(k);
    }
  }
  return Array.from(keys);
}
