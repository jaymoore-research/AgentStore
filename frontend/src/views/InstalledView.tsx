import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
  const [updatesAvailable, setUpdatesAvailable] = useState<Set<string>>(new Set());
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [settingsView, setSettingsView] = useState<"main" | "instructions">("main");
  const [settingsInstructions, setSettingsInstructions] = useState<string>("");
  const [skillFilter, setSkillFilter] = useState<Record<string, string>>({});

  // Use a ref to track the open settings modal name so loadPackages
  // can sync it without creating a dependency cycle.
  const settingsNameRef = useRef<string | null>(null);
  useEffect(() => {
    settingsNameRef.current = settingsModal?.name ?? null;
  }, [settingsModal]);

  const loadPackages = useCallback(async () => {
    try {
      const pkgs = await invoke<PackageManifest[]>("list_packages");
      setPackages(pkgs);
      setError(null);
      // Sync settings modal if one is open
      const modalName = settingsNameRef.current;
      if (modalName) {
        const updated = pkgs.find((p) => p.name === modalName);
        if (updated) setSettingsModal(updated);
        else setSettingsModal(null);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const checkUpdates = useCallback(async () => {
    setCheckingUpdates(true);
    try {
      const names = await invoke<string[]>("check_for_updates");
      setUpdatesAvailable(new Set(names));
    } catch {
      // Network unavailable or other error
    } finally {
      setCheckingUpdates(false);
    }
  }, []);

  useEffect(() => {
    loadPackages();
    checkUpdates();

    const unlisten = listen<InstallProgress>("install-progress", (event) => {
      if (event.payload.progress >= 1.0) {
        setTimeout(() => {
          loadPackages();
          checkUpdates();
        }, 2100);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadPackages, checkUpdates]);

  async function handleToggle(
    name: string,
    platformId: string,
    currentlyEnabled: boolean,
  ) {
    try {
      await invoke("toggle_platform", {
        name,
        platformId,
        enable: !currentlyEnabled,
        scope: "profile",
        projectPath: null,
      });
      await loadPackages();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleToggleProfile(pkgName: string, enable: boolean) {
    try {
      // Toggle profile for all enabled platforms
      for (const pid of Object.keys(
        packages.find((p) => p.name === pkgName)?.enabled ?? {}
      )) {
        await invoke("toggle_profile", {
          name: pkgName,
          platformId: pid,
          enable,
        });
      }
      await loadPackages();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleUpdate(name: string) {
    setUpdating(name);
    try {
      await invoke<PackageManifest>("update_package", { name });
      setUpdatesAvailable((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
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

  async function handleAddProject(pkgName: string) {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select project directory",
      });
      if (selected) {
        await invoke("add_project_dir", {
          name: pkgName,
          projectPath: selected as string,
        });
        await loadPackages();
      }
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleRemoveProject(pkgName: string, projectPath: string) {
    try {
      await invoke("remove_project_dir", {
        name: pkgName,
        projectPath,
      });
      await loadPackages();
    } catch (e) {
      setError(String(e));
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

  // Check if profile is enabled for any platform on this package
  function isProfileEnabled(pkg: PackageManifest): boolean {
    return Object.values(pkg.enabled).some((s) => s.profile);
  }

  // Collect unique project paths across all enabled platforms for a package
  function getProjects(pkg: PackageManifest): string[] {
    const all = new Set<string>();
    for (const state of Object.values(pkg.enabled)) {
      for (const p of state.projects) {
        all.add(p);
      }
    }
    return [...all];
  }

  if (loading) return <div className="view-loading">Loading packages...</div>;

  return (
    <div className="view">
      <div className="view-title-row">
        <h2 className="view-title">Installed Packages</h2>
        {packages.length > 0 && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={checkUpdates}
            disabled={checkingUpdates}
          >
            {checkingUpdates ? "Checking..." : "Check for updates"}
          </button>
        )}
      </div>
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
                  {updatesAvailable.has(pkg.name) && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleUpdate(pkg.name)}
                      disabled={updating === pkg.name}
                    >
                      {updating === pkg.name ? "Updating..." : "Update available"}
                    </button>
                  )}
                  <button
                    className="btn btn-secondary"
                    onClick={() => { setSettingsView("main"); setSettingsModal(pkg); }}
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
                {Object.keys(pkg.enabled).map((pid) => (
                  <span key={pid} className="meta-tag">{pid}</span>
                ))}
              </div>

              {expanded.has(pkg.name) && pkg.components.skills.length > 0 && (
                <div className="skills-dropdown">
                  {pkg.components.skills.length > 10 && (
                    <input
                      className="skills-search"
                      type="text"
                      placeholder="Search skills..."
                      value={skillFilter[pkg.name] || ""}
                      onChange={(e) => setSkillFilter((prev) => ({ ...prev, [pkg.name]: e.target.value }))}
                    />
                  )}
                  <div className="skills-list">
                    {pkg.components.skills
                      .filter((s) => {
                        const q = (skillFilter[pkg.name] || "").toLowerCase();
                        if (!q) return true;
                        return s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q);
                      })
                      .map((skill) => (
                        <button
                          key={skill.name}
                          className="skill-item"
                          onClick={() => showSkillDoc(pkg.name, skill.name)}
                        >
                          <span className="skill-item-name">{skill.name}</span>
                          {skill.description && (
                            <span className="skill-item-desc">{skill.description}</span>
                          )}
                        </button>
                      ))}
                  </div>
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
              <Markdown remarkPlugins={[remarkGfm]}>{docModal.content}</Markdown>
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
          <div className="dialog settings-dialog" style={{ maxWidth: 520 }}>
            {settingsView === "instructions" ? (
              <>
                <div className="dialog-title-row">
                  <button className="btn-back" onClick={() => setSettingsView("main")}>
                    &larr;
                  </button>
                  <h2 className="dialog-title">Instructions</h2>
                </div>
                <div className="settings-dialog-body markdown-body">
                  <Markdown remarkPlugins={[remarkGfm]}>{settingsInstructions}</Markdown>
                </div>
                <div className="settings-dialog-footer">
                  <button className="btn btn-secondary" onClick={() => setSettingsView("main")}>
                    Back
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="dialog-title">{settingsModal.name} Settings</h2>

                <div className="settings-dialog-body">
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
                              onChange={() => handleToggle(settingsModal.name, pid, enabled)}
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
                      Where this package is available. Enable globally, in specific projects, or both.
                    </p>

                    <label className="profile-toggle">
                      <input
                        type="checkbox"
                        checked={isProfileEnabled(settingsModal)}
                        disabled={Object.keys(settingsModal.enabled).length === 0}
                        onChange={(e) => handleToggleProfile(settingsModal.name, e.target.checked)}
                      />
                      <span>Profile (~)</span>
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)", marginLeft: 4 }}>
                        Available globally
                      </span>
                    </label>

                    {(() => {
                      const projects = getProjects(settingsModal);
                      return (
                        <div className="project-list" style={{ marginTop: 10 }}>
                          {projects.map((projectPath) => (
                            <div key={projectPath} className="project-entry">
                              <code className="project-path">{projectPath}</code>
                              <button
                                className="project-remove"
                                onClick={() => handleRemoveProject(settingsModal.name, projectPath)}
                                title="Remove from this project"
                              >
                                &times;
                              </button>
                            </div>
                          ))}
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleAddProject(settingsModal.name)}
                            disabled={Object.keys(settingsModal.enabled).length === 0}
                          >
                            + Add project
                          </button>
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
                          onClick={async () => {
                            const parts: string[] = [];
                            for (const file of INSTRUCTION_FILES) {
                              try {
                                const content = await invoke<string>("read_package_file", { name: settingsModal.name, relPath: file });
                                parts.push(`## ${file}\n\n${content}`);
                              } catch { /* skip */ }
                            }
                            setSettingsInstructions(parts.length > 0 ? parts.join("\n\n---\n\n") : "No instruction files found.");
                            setSettingsView("instructions");
                          }}
                        >
                          View instructions
                        </button>
                      )}
                    </div>
                  </section>
                </div>

                <div className="settings-dialog-footer">
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
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
