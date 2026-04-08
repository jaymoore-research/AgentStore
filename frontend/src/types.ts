export interface PackageManifest {
  name: string;
  repo: string;
  description: string | null;
  stars: number;
  installed_at: string;
  supports: string[];
  enabled: Record<string, PlatformState>;
  components: PackageComponents;
}

export interface PlatformState {
  scope: string;
  project_path: string | null;
}

export interface PackageComponents {
  skills: string[];
  mcp_servers: string[];
  instructions: boolean;
  hooks: string[];
  keybindings: string[];
}

export interface AppConfig {
  github_token: string | null;
  first_run: boolean;
}

export interface InstallProgress {
  step: string;
  detail: string;
  progress: number;
}
