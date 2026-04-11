import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import Markdown from "react-markdown";
import type { PackageManifest, InstallProgress } from "../types";

const ALL_PLATFORMS = ["claude", "codex", "copilot", "gemini", "cursor", "opencode", "vscode"];

const INSTRUCTION_FILES = ["CLAUDE.md", "AGENTS.md", "GEMINI.md", ".cursorrules", ".github/copilot-instructions.md"];

export default function InstalledView() {
  const [packages, setPackages] = useState<PackageManifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [docModal, setDocModal] = useState<{ title: string; content: string } | null>(null);
  const [settingsModal, setSettingsModal] = useState<PackageManifest | null>(null);
  const [uninstalling, setUninstalling] = useState<string | null>(null);
  const [scopeChanging, setScopeChanging] = useState(false);

  const loadPackages = useCallback(async () => {
    try {
      const pkgs = await invoke<PackageManifest[]>("list_packages");
      setPackages(pkgs);
      setError(null);
      // Keep settings modal in sync
      if (settingsModal) {
        const updated = pkgs.find((p) => p.name === settingsModal.name);
        if (updated) setSettingsModal(updated);
        else setSettingsModal(null);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [settingsModal]);

  useEffect(() => {
    loadPackages();

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
    if (!confirm(`Uninstall ${name}? This removes all symlinks and injected instructions.`)) return;
    setUninstalling(name);
    setSettingsModal(null);
    try {
      await invoke("uninstall_package", { name });
      await loadPackages();
    } catch (e) {
      setError(String(e));
    } finally {
      setUninstalling(null);
    }
  }

  async function handleScopeChange(pkg: PackageManifest, newScope: string, projectPath: string | null) {
    setScopeChanging(true);
    try {
      const enabledPlatforms = Object.keys(pkg.enabled);
      // Disable all, then re-enable with new scope
      for (const pid of enabledPlatforms) {
        await invoke("toggle_platform", {
          name: pkg.name,
          platformId: pid,
          enable: false,
          scope: "profile",
          projectPath: null,
        });
      }
      for (const pid of enabledPlatforms) {
        await invoke("toggle_platform", {
          name: pkg.name,
          platformId: pid,
          enable: true,
          scope: newScope,
          projectPath,
        });
      }
      await loadPackages();
    } catch (e) {
      setError(String(e));
    } finally {
      setScopeChanging(false);
    }
  }

  async function showInstructions(pkgName: string) {
    const parts: string[] = [];
    for (const file of INSTRUCTION_FILES) {
      try {
        const content = await invoke<string>("read_package_file", { name: pkgName, relPath: file });
        parts.push(`## ${file}\n\n${content}`);
      } catch {
        // File doesn't exist
      }
    }
    if (parts.length === 0) {
      parts.push("No instruction files found in this package.");
    }
    setDocModal({ title: `${pkgName} — Instructions`, content: parts.join("\n\n---\n\n") });
  }

  async function showSkillDoc(pkgName: string, skillName: string) {
    const candidates = [
      `.claude/skills/${skillName}/${skillName}.md`,
      `.github/skills/${skillName}/${skillName}.md`,
      `.cursor/skills/${skillName}/${skillName}.md`,
      `skills/${skillName}/${skillName}.md`,
      `skills/${skillName}/SKILL.md`,
      `.claude/skills/${skillName}/SKILL.md`,
      `.github/skills/${skillName}/SKILL.md`,
    ];
    for (const path of candidates) {
      try {
        const content = await invoke<string>("read_package_file", { name: pkgName, relPath: path });
        setDocModal({ title: `${pkgName} / ${skillName}`, content });
        return;
      } catch {
        // try next
      }
    }
    setDocModal({
      title: `${pkgName} / ${skillName}`,
      content: `Could not find a documentation file for skill "${skillName}".`,
    });
  }

  if (loading) return <div className="view-loading">Loading packages...</div>;

  return (
    <div className="view">
      <h2 className="view-title">Installed Packages</h2>
      {error && <p className="form-error">{error}</p>}
      {packages.length === 0 ? (
        <p className="empty-state">
          No packages installed. Use &ldquo;+ Install Package&rdquo; to get started.
        </p>
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
                    className="btn btn-secondary"
                    onClick={() => setSettingsModal(pkg)}
                  >
                    Settings
                  </button>
                </div>
              </div>

              <div className="package-meta">
                {pkg.components.skills.length > 0 && (
                  <button
                    className="meta-tag meta-tag-interactive"
                    onClick={() =>
                      setExpanded((prev) => {
                        const next = new Set(prev);
                        next.has(pkg.name) ? next.delete(pkg.name) : next.add(pkg.name);
                        return next;
                      })
                    }
                  >
                    Skills: {pkg.components.skills.length}{" "}
                    {expanded.has(pkg.name) ? "\u25B4" : "\u25BE"}
                  </button>
                )}
                {pkg.components.mcp_servers.length > 0 && (
                  <span className="meta-tag">MCP: {pkg.components.mcp_servers.length}</span>
                )}
                {pkg.components.instructions && (
                  <button
                    className="meta-tag meta-tag-interactive"
                    onClick={() => showInstructions(pkg.name)}
                  >
                    Instructions
                  </button>
                )}
                {pkg.components.hooks.length > 0 && (
                  <span className="meta-tag">Hooks: {pkg.components.hooks.length}</span>
                )}
                <span className="meta-tag">
                  {Object.keys(pkg.enabled).length} platform
                  {Object.keys(pkg.enabled).length !== 1 ? "s" : ""} enabled
                </span>
              </div>

              {expanded.has(pkg.name) && pkg.components.skills.length > 0 && (
                <div className="skills-list">
                  {pkg.components.skills.map((skill) => (
                    <button
                      key={skill}
                      className="skill-chip skill-chip-interactive"
                      onClick={() => showSkillDoc(pkg.name, skill)}
                    >
                      {skill}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* -------- Document viewer modal (markdown) -------- */}
      {docModal && (
        <div
          className="dialog-overlay"
          onClick={(e) => e.target === e.currentTarget && setDocModal(null)}
        >
          <div className="doc-modal">
            <div className="doc-modal-header">
              <h3 className="doc-modal-title">{docModal.title}</h3>
              <button className="doc-modal-close" onClick={() => setDocModal(null)}>
                &times;
              </button>
            </div>
            <div className="doc-modal-content markdown-body">
              <Markdown>{docModal.content}</Markdown>
            </div>
          </div>
        </div>
      )}

      {/* -------- Package settings modal -------- */}
      {settingsModal && (
        <div
          className="dialog-overlay"
          onClick={(e) => e.target === e.currentTarget && setSettingsModal(null)}
        >
          <div className="dialog" style={{ maxWidth: 520 }}>
            <h2 className="dialog-title">{settingsModal.name} Settings</h2>

            <section style={{ marginBottom: 20 }}>
              <h4 className="settings-section-title" style={{ marginBottom: 8 }}>
                Platforms
              </h4>
              <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "0 0 10px" }}>
                Toggle which platforms this package is enabled for.
              </p>
              <div className="platform-checks">
                {ALL_PLATFORMS.map((pid) => {
                  const state = settingsModal.enabled[pid];
                  const enabled = !!state;
                  return (
                    <label key={pid} className="platform-check-label">
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={() =>
                          handleToggle(
                            settingsModal.name,
                            pid,
                            enabled,
                            state?.scope ?? "profile",
                            state?.project_path ?? null
                          )
                        }
                      />
                      {pid}
                    </label>
                  );
                })}
              </div>
            </section>

            <section style={{ marginBottom: 20 }}>
              <h4 className="settings-section-title" style={{ marginBottom: 8 }}>
                Scope
              </h4>
              <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "0 0 10px" }}>
                Where symlinks are created. Profile installs globally; project installs to a specific directory.
              </p>
              {(() => {
                const first = Object.values(settingsModal.enabled)[0];
                const currentScope = first?.scope ?? "profile";
                const currentProject = first?.project_path ?? "";
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        className={`btn btn-sm ${currentScope === "profile" ? "btn-primary" : "btn-secondary"}`}
                        disabled={scopeChanging || Object.keys(settingsModal.enabled).length === 0}
                        onClick={() => {
                          if (currentScope !== "profile") {
                            handleScopeChange(settingsModal, "profile", null);
                          }
                        }}
                      >
                        Profile (~)
                      </button>
                      <button
                        className={`btn btn-sm ${currentScope === "project" ? "btn-primary" : "btn-secondary"}`}
                        disabled={scopeChanging || Object.keys(settingsModal.enabled).length === 0}
                        onClick={async () => {
                          const selected = await open({
                            directory: true,
                            multiple: false,
                            title: "Select project directory",
                            defaultPath: currentProject || undefined,
                          });
                          if (selected) {
                            handleScopeChange(settingsModal, "project", selected as string);
                          }
                        }}
                      >
                        Project
                      </button>
                    </div>
                    {currentScope === "project" && currentProject && (
                      <code style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{currentProject}</code>
                    )}
                    {scopeChanging && (
                      <span style={{ fontSize: 11, color: "var(--accent)" }}>Changing scope...</span>
                    )}
                  </div>
                );
              })()}
            </section>

            <section style={{ marginBottom: 20 }}>
              <h4 className="settings-section-title" style={{ marginBottom: 8 }}>
                Components
              </h4>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {settingsModal.components.skills.length > 0 && (
                  <span className="meta-tag">
                    {settingsModal.components.skills.length} skill
                    {settingsModal.components.skills.length !== 1 ? "s" : ""}
                  </span>
                )}
                {settingsModal.components.mcp_servers.length > 0 && (
                  <span className="meta-tag">
                    {settingsModal.components.mcp_servers.length} MCP server
                    {settingsModal.components.mcp_servers.length !== 1 ? "s" : ""}
                  </span>
                )}
                {settingsModal.components.instructions && (
                  <button
                    className="meta-tag meta-tag-interactive"
                    onClick={() => {
                      setSettingsModal(null);
                      showInstructions(settingsModal.name);
                    }}
                  >
                    View instructions
                  </button>
                )}
              </div>
            </section>

            <div
              style={{
                borderTop: "1px solid var(--border-subtle)",
                paddingTop: 16,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <button
                className="btn btn-danger btn-sm"
                onClick={() => handleUninstall(settingsModal.name)}
                disabled={uninstalling === settingsModal.name}
              >
                {uninstalling === settingsModal.name ? "Removing..." : "Uninstall"}
              </button>
              <button className="btn btn-secondary" onClick={() => setSettingsModal(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
