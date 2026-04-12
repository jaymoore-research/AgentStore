import { NavLink } from "react-router-dom";
import InstallDialog from "./InstallDialog";

interface Props {
  installRepo?: string | null;
  onInstallClose: () => void;
}

export default function Sidebar({ installRepo, onInstallClose }: Props) {
  const dialogOpen = !!installRepo;

  function handleClose() {
    onInstallClose();
  }

  return (
    <aside className="sidebar">
      <NavLink to="/" className="sidebar-title">AgentStore</NavLink>
      <nav className="sidebar-nav">
        <NavLink
          to="/"
          end
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
        <NavLink
          to="/about"
          className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
        >
          About
        </NavLink>
      </nav>
      {dialogOpen && (
        <InstallDialog
          onClose={handleClose}
          prefillRepo={installRepo ?? undefined}
        />
      )}
    </aside>
  );
}
