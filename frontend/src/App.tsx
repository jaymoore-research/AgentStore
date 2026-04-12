import { Routes, Route, useLocation } from "react-router-dom";
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
  const location = useLocation();
  const onAbout = location.pathname === "/about";

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
        {/* Compact get-started pill, top-right, hidden on About */}
        {!bannerDismissed && !agentstoreInstalled && !onAbout && (
          <div className="install-pill">
            <button
              className="install-pill-btn"
              onClick={() => setInstallRepo("jaymoore-research/AgentStore")}
              title="Install the AgentStore skill pack"
            >
              + Install AgentStore skill
            </button>
            <button
              className="install-pill-dismiss"
              onClick={dismissBanner}
              aria-label="Dismiss"
              title="Dismiss"
            >
              ×
            </button>
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
          <Route path="/" element={<SearchView onInstall={(repo) => setInstallRepo(repo)} installedRepos={installedRepos} />} />
          <Route path="/installed" element={<InstalledView />} />
          <Route path="/settings" element={<SettingsView />} />
          <Route path="/about" element={<AboutView />} />
        </Routes>
      </main>
    </div>
  );
}
