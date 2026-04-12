import { Routes, Route } from "react-router-dom";
import { useEffect, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import Sidebar from "./components/Sidebar";
import SearchView from "./views/SearchView";
import InstalledView from "./views/InstalledView";
import SettingsView from "./views/SettingsView";
import AboutView from "./views/AboutView";
import type { InstallProgress, PackageManifest } from "./types";

export default function App() {
  const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null);
  const [installRepo, setInstallRepo] = useState<string | null>(null);
  const [installedRepos, setInstalledRepos] = useState<Set<string>>(new Set());
  const [bannerDismissed, setBannerDismissed] = useState(
    () => localStorage.getItem("agentstore:banner-dismissed") === "1"
  );

  const agentstoreInstalled = installedRepos.has("jaymoore-research/agentstore");

  const refreshInstalled = useCallback(async () => {
    try {
      const pkgs = await invoke<PackageManifest[]>("list_packages");
      setInstalledRepos(new Set(pkgs.map((p) => p.repo.toLowerCase())));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshInstalled();
  }, [refreshInstalled]);

  useEffect(() => {
    const unlisten = listen<InstallProgress>("install-progress", (event) => {
      setInstallProgress(event.payload);
      if (event.payload.progress >= 1.0) {
        setTimeout(() => setInstallProgress(null), 2000);
        refreshInstalled();
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [refreshInstalled]);

  function dismissBanner() {
    setBannerDismissed(true);
    localStorage.setItem("agentstore:banner-dismissed", "1");
  }

  return (
    <div className="app-layout">
      <Sidebar
        installRepo={installRepo}
        onInstallClose={() => setInstallRepo(null)}
      />
      <main className="main-content">
        {/* Global get-started banner */}
        {!bannerDismissed && !agentstoreInstalled && (
          <div className="about-banner" style={{ margin: "0 0 16px" }}>
            <div className="about-banner-content">
              <strong>Get started</strong>
              <p>
                Install the AgentStore skill pack to add <code>agentstore</code> as a
                skill in your AI coding tools, so you can install and manage packages
                from inside your editor.
              </p>
            </div>
            <div className="about-banner-actions">
              <button
                className="btn btn-primary btn-sm"
                onClick={() => setInstallRepo("jaymoore-research/AgentStore")}
              >
                Install AgentStore skill
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={dismissBanner}
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {installProgress && (
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${installProgress.progress * 100}%` }}
            />
            <span className="progress-text">
              {installProgress.step}: {installProgress.detail}
            </span>
          </div>
        )}
        <Routes>
          <Route path="/" element={<AboutView />} />
          <Route path="/browse" element={<SearchView onInstall={(repo) => setInstallRepo(repo)} installedRepos={installedRepos} />} />
          <Route path="/installed" element={<InstalledView />} />
          <Route path="/settings" element={<SettingsView />} />
        </Routes>
      </main>
    </div>
  );
}
