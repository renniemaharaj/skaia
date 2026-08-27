export interface DeploymentBlueprint {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
}

export interface DeploymentInstance {
  id: number;
  blueprint_id: number;
  status: string;
  version_tag: string;
  config_payload: {
    url?: string;
    port?: number;
    apps?: string[];
    [key: string]: unknown;
  };
}

export interface DeploymentLogEntry {
  time: string;
  level: string;
  prefix: string;
  msg: string;
  file?: string;
  line?: number;
  func?: string;
}

export interface DeploymentContainerStats {
  name: string;
  cpu_percent: number;
  mem_usage: string;
  mem_limit: string;
  mem_percent: number;
  net_io: string;
  block_io: string;
  pids: number;
  Name?: string;
  CPUPerc?: string;
  MemUsage?: string;
  NetIO?: string;
}

export type DeploymentViewMode = "grid" | "list";
export type FrappeVersion = "15" | "16" | "17-dev";
