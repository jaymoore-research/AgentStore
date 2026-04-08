import { Routes, Route } from "react-router-dom";
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import Sidebar from "./components/Sidebar";
import InstalledView from "./views/InstalledView";
import SettingsView from "./views/SettingsView";
import type { InstallProgress } from "./types";

export default function App() {
  const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null);

  useEffect(() => {
    const unlisten = listen<InstallProgress>("install-progress", (event) => {
      setInstallProgress(event.payload);
      if (event.payload.progress >= 1.0) {
        setTimeout(() => setInstallProgress(null), 2000);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
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
          <Route path="/" element={<InstalledView />} />
          <Route path="/settings" element={<SettingsView />} />
        </Routes>
      </main>
    </div>
  );
}
