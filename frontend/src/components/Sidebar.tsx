import { useState } from "react";
import { NavLink } from "react-router-dom";
import InstallDialog from "./InstallDialog";

export default function Sidebar() {
  const [showInstall, setShowInstall] = useState(false);

  return (
    <aside className="sidebar">
      <h1 className="sidebar-title">AgentStore Lite</h1>
      <nav className="sidebar-nav">
        <NavLink
          to="/"
          end
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
      {showInstall && <InstallDialog onClose={() => setShowInstall(false)} />}
    </aside>
  );
}
