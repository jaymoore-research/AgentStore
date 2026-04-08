import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AppConfig } from "../types";

const PLATFORMS = ["claude", "cursor", "windsurf", "vscode"];

export default function SettingsView() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [platformAvailable, setPlatformAvailable] = useState<Record<string, boolean>>({});
  const [dataDir, setDataDir] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const cfg = await invoke<AppConfig>("get_config");
        setConfig(cfg);
        setToken(cfg.github_token ?? "");
      } catch (e) {
        setError(String(e));
      }

      // Check platform availability
      for (const p of PLATFORMS) {
        invoke<boolean>("check_platform_dir", { platformId: p })
          .then((available) => setPlatformAvailable((prev) => ({ ...prev, [p]: available })))
          .catch(() => setPlatformAvailable((prev) => ({ ...prev, [p]: false })));
      }

      // Try to get data dir via a config key or env
      try {
        const dir = await invoke<string>("get_data_dir");
        setDataDir(dir);
      } catch {
        // Command may not exist; silently skip
      }
    }
    load();
  }, []);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated: AppConfig = {
        ...config,
        github_token: token.trim() || null,
        first_run: false,
      };
      await invoke("set_config", { config: updated });
      setConfig(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="view">
      <h2 className="view-title">Settings</h2>
      {error && <p className="form-error">{error}</p>}

      <section className="settings-section">
        <h3 className="settings-section-title">GitHub Token</h3>
        <p className="settings-desc">
          Required to install packages from private repos and to avoid rate limits.
        </p>
        <div className="token-row">
          <input
            className="form-input token-input"
            type={showToken ? "text" : "password"}
            placeholder="ghp_..."
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <button
            className="btn btn-secondary"
            onClick={() => setShowToken((v) => !v)}
            type="button"
          >
            {showToken ? "Hide" : "Show"}
          </button>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{ marginTop: "0.75rem" }}
        >
          {saving ? "Saving..." : saved ? "Saved!" : "Save"}
        </button>
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">Detected Platforms</h3>
        <div className="platform-list">
          {PLATFORMS.map((p) => (
            <div key={p} className="platform-item">
              <span
                className={`platform-status-dot ${platformAvailable[p] ? "dot-green" : "dot-grey"}`}
              />
              <span className="platform-name">{p}</span>
              <span className="platform-status-text">
                {platformAvailable[p] === undefined
                  ? "checking..."
                  : platformAvailable[p]
                  ? "found"
                  : "not found"}
              </span>
            </div>
          ))}
        </div>
      </section>

      {dataDir && (
        <section className="settings-section">
          <h3 className="settings-section-title">Data Directory</h3>
          <code className="data-dir-path">{dataDir}</code>
        </section>
      )}
    </div>
  );
}
