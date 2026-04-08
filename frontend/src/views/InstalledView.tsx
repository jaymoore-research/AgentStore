import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { PackageManifest, InstallProgress } from "../types";

export default function InstalledView() {
  const [packages, setPackages] = useState<PackageManifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [uninstalling, setUninstalling] = useState<string | null>(null);

  const loadPackages = useCallback(async () => {
    try {
      const pkgs = await invoke<PackageManifest[]>("list_packages");
      setPackages(pkgs);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPackages();

    // Refresh after install completes
    const unlisten = listen<InstallProgress>("install-progress", (event) => {
      if (event.payload.progress >= 1.0) {
        setTimeout(() => loadPackages(), 2100);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadPackages]);

  async function handleToggle(
    name: string,
    platformId: string,
    currentlyEnabled: boolean,
    scope: string,
    projectPath: string | null
  ) {
    try {
      await invoke("toggle_platform", {
        name,
        platformId,
        enable: !currentlyEnabled,
        scope,
        projectPath,
      });
      await loadPackages();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleUpdate(name: string) {
    setUpdating(name);
    try {
      await invoke<PackageManifest>("update_package", { name });
      await loadPackages();
    } catch (e) {
      setError(String(e));
    } finally {
      setUpdating(null);
    }
  }

  async function handleUninstall(name: string) {
    if (!confirm(`Uninstall ${name}?`)) return;
    setUninstalling(name);
    try {
      await invoke("uninstall_package", { name });
      await loadPackages();
    } catch (e) {
      setError(String(e));
    } finally {
      setUninstalling(null);
    }
  }

  if (loading) return <div className="view-loading">Loading packages...</div>;

  return (
    <div className="view">
      <h2 className="view-title">Installed Packages</h2>
      {error && <p className="form-error">{error}</p>}
      {packages.length === 0 ? (
        <p className="empty-state">No packages installed. Use &ldquo;+ Install Package&rdquo; to get started.</p>
      ) : (
        <div className="package-list">
          {packages.map((pkg) => (
            <div key={pkg.name} className="package-card">
              <div className="package-header">
                <div>
                  <h3 className="package-name">{pkg.name}</h3>
                  <a
                    className="package-repo"
                    href={`https://github.com/${pkg.repo}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {pkg.repo}
                  </a>
                  {pkg.description && <p className="package-desc">{pkg.description}</p>}
                </div>
                <div className="package-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={() => handleUpdate(pkg.name)}
                    disabled={updating === pkg.name}
                  >
                    {updating === pkg.name ? "Updating..." : "Update"}
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => handleUninstall(pkg.name)}
                    disabled={uninstalling === pkg.name}
                  >
                    {uninstalling === pkg.name ? "Removing..." : "Uninstall"}
                  </button>
                </div>
              </div>

              {pkg.supports.length > 0 && (
                <div className="platform-row">
                  <span className="platform-row-label">Platforms:</span>
                  {pkg.supports.map((platformId) => {
                    const state = pkg.enabled[platformId];
                    const enabled = !!state;
                    return (
                      <button
                        key={platformId}
                        className={`platform-toggle ${enabled ? "enabled" : "disabled"}`}
                        onClick={() =>
                          handleToggle(
                            pkg.name,
                            platformId,
                            enabled,
                            state?.scope ?? "profile",
                            state?.project_path ?? null
                          )
                        }
                      >
                        {platformId}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="package-meta">
                {pkg.components.skills.length > 0 && (
                  <span className="meta-tag">Skills: {pkg.components.skills.length}</span>
                )}
                {pkg.components.mcp_servers.length > 0 && (
                  <span className="meta-tag">MCP: {pkg.components.mcp_servers.length}</span>
                )}
                {pkg.components.instructions && <span className="meta-tag">Instructions</span>}
                {pkg.components.hooks.length > 0 && (
                  <span className="meta-tag">Hooks: {pkg.components.hooks.length}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
