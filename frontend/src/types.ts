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
  profile: boolean;
  projects: string[];
}

export interface SkillInfo {
  name: string;
  description: string;
  file_path: string;
  size_bytes: number;
  has_frontmatter: boolean;
}

export interface PackageComponents {
  skills: SkillInfo[];
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
