/**
 * Layout principal avec menu de navigation vertical + hamburger mobile.
 */

import { useState, useCallback } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

interface Props {
  connected: boolean;
  onLogout: () => void;
  unreadCount: number;
}

export function Layout({ connected, onLogout, unreadCount }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  return (
    <div className="app-layout">
      {/* Hamburger button (mobile only) */}
      <button
        className={`hamburger ${menuOpen ? "open" : ""}`}
        onClick={() => setMenuOpen((v) => !v)}
        aria-label="Menu"
      >
        <span /><span /><span />
      </button>

      {/* Overlay backdrop (mobile only) */}
      {menuOpen && <div className="nav-overlay" onClick={closeMenu} />}

      <nav className={`nav-sidebar ${menuOpen ? "visible" : ""}`}>
        <div className="nav-brand-row">
          <div className="nav-brand">Holo</div>
          <button className="nav-close" onClick={closeMenu} aria-label="Fermer">&times;</button>
        </div>
        <div className="nav-links">
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`} onClick={closeMenu}>
            <span className="nav-icon">&#9783;</span>
            <span className="nav-label">Dashboard</span>
          </NavLink>
          <NavLink to="/config" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`} onClick={closeMenu}>
            <span className="nav-icon">&#9881;</span>
            <span className="nav-label">Configuration</span>
          </NavLink>
          <NavLink to="/debug" className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`} onClick={closeMenu}>
            <span className="nav-icon">&#9998;</span>
            <span className="nav-label">Debug</span>
            {unreadCount > 0 && location.pathname !== "/debug" && (
              <span className="nav-badge">{unreadCount}</span>
            )}
          </NavLink>
        </div>
        <div className="nav-footer">
          <a href="/hologram" className="btn-hologram" target="_blank" rel="noopener">Hologramme</a>
          <div className="nav-status-row">
            <span className={`status-dot ${connected ? "online" : "offline"}`} />
            <span className="nav-status">{connected ? "Connecté" : "Déconnecté"}</span>
          </div>
          <button className="btn-logout" onClick={onLogout}>Déconnexion</button>
        </div>
      </nav>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
