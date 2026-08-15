export interface DevToolPath {
  path: string;
  label: string;
  description: string;
}

export interface DevToolDefinition {
  id: string;
  name: string;
  description: string;
  isSafeToClean: boolean;
  paths: DevToolPath[];
  website?: string | undefined;
}
