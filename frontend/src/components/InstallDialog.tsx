import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { PackageManifest } from "../types";

const PLATFORMS = ["claude", "cursor", "windsurf", "vscode"];

interface Props {
  onClose: () => void;
}

export default function InstallDialog({ onClose }: Props) {
  const [repoInput, setRepoInput] = useState("");
  const [scope, setScope] = useState<"profile" | "project">("profile");
  const [projectPath, setProjectPath] = useState("");
  const [platformAvailable, setPlatformAvailable] = useState<Record<string, boolean>>({});
  const [selectedPlatforms, setSelectedPlatforms] = useState<Record<string, boolean>>({});
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const checks: Promise<void>[] = PLATFORMS.map(async (p) => {
      try {
        const available = await invoke<boolean>("check_platform_dir", { platformId: p });
        setPlatformAvailable((prev) => ({ ...prev, [p]: available }));
        if (available) {
          setSelectedPlatforms((prev) => ({ ...prev, [p]: true }));
        }
      } catch {
        setPlatformAvailable((prev) => ({ ...prev, [p]: false }));
      }
    });
    Promise.all(checks);
  }, []);

  function togglePlatform(platform: string) {
    setSelectedPlatforms((prev) => ({ ...prev, [platform]: !prev[platform] }));
  }

  async function handleInstall() {
    setError(null);
    const parts = repoInput.trim().split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      setError("Enter a valid owner/repo (e.g. garrytan/gstack)");
      return;
    }
    const [owner, name] = parts;
    const enablePlatforms = Object.entries(selectedPlatforms)
      .filter(([, v]) => v)
      .map(([k]) => k);

    setInstalling(true);
    try {
      await invoke<PackageManifest>("install_package", {
        owner,
        name,
        enablePlatforms,
        scope,
        projectPath: scope === "project" ? projectPath : null,
      });
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setInstalling(false);
    }
  }

  return (
    <div className="dialog-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog">
        <h2 className="dialog-title">Install Package</h2>

        <label className="form-label">
          Repository (owner/repo)
          <input
            className="form-input"
            type="text"
            placeholder="e.g. garrytan/gstack"
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleInstall()}
          />
        </label>

        <fieldset className="form-fieldset">
          <legend className="form-legend">Platforms</legend>
          <div className="platform-checks">
            {PLATFORMS.map((p) => (
              <label
                key={p}
                className={`platform-check-label ${!platformAvailable[p] ? "unavailable" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={!!selectedPlatforms[p]}
                  disabled={!platformAvailable[p]}
                  onChange={() => togglePlatform(p)}
                />
                {p}
                {!platformAvailable[p] && <span className="unavailable-tag"> (not found)</span>}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="form-label">
          Scope
          <select
            className="form-input"
            value={scope}
            onChange={(e) => setScope(e.target.value as "profile" | "project")}
          >
            <option value="profile">Profile (global)</option>
            <option value="project">Project</option>
          </select>
        </label>

        {scope === "project" && (
          <label className="form-label">
            Project path
            <input
              className="form-input"
              type="text"
              placeholder="/path/to/project"
              value={projectPath}
              onChange={(e) => setProjectPath(e.target.value)}
            />
          </label>
        )}

        {error && <p className="form-error">{error}</p>}

        <div className="dialog-actions">
          <button className="btn btn-secondary" onClick={onClose} disabled={installing}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleInstall} disabled={installing}>
            {installing ? "Installing..." : "Install"}
          </button>
        </div>
      </div>
    </div>
  );
}
