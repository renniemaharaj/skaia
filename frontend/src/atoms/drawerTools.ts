import { atom } from "jotai";

export interface DrawerToolOption {
  value: string;
  label: string;
}

export interface DrawerToolSelect {
  id: string;
  label: string;
  value: string;
  options: DrawerToolOption[];
  truncateSelectedTo?: number;
  onChange: (value: string) => void;
}

export interface DrawerToolAction {
  id: string;
  label: string;
  tone?: "default" | "success" | "danger";
  disabled?: boolean;
  onSelect: () => void;
}

export interface DrawerToolGroup {
  id: string;
  label: string;
  selects?: DrawerToolSelect[];
  actions: DrawerToolAction[];
}

/** Route-owned contextual actions shown through the global drawer. */
export const drawerToolGroupAtom = atom<DrawerToolGroup | null>(null);
