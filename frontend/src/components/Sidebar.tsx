import { useState } from "react";
import { NavLink } from "react-router-dom";
import InstallDialog from "./InstallDialog";

interface Props {
  installRepo?: string | null;
  onInstallClose: () => void;
}

export default function Sidebar({ installRepo, onInstallClose }: Props) {
  const [showInstall, setShowInstall] = useState(false);

  const dialogOpen = showInstall || !!installRepo;

  function handleClose() {
    setShowInstall(false);
    onInstallClose();
  }

  return (
    <aside className="sidebar">
      <h1 className="sidebar-title">AgentStore</h1>
      <nav className="sidebar-nav">
        <NavLink
          to="/"
          end
          className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
        >
          About
        </NavLink>
        <NavLink
          to="/browse"
          className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
        >
          Browse
        </NavLink>
        <NavLink
          to="/installed"
          className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
        >
          Installed
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
        >
          Settings
        </NavLink>
      </nav>
      <button className="install-btn" onClick={() => setShowInstall(true)}>
        + Install Package
      </button>
      {dialogOpen && (
        <InstallDialog
          onClose={handleClose}
          prefillRepo={installRepo ?? undefined}
        />
      )}
    </aside>
  );
}
