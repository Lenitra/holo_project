/**
 * Layout principal avec menu de navigation vertical + hamburger mobile.
 *
 * Le crayon en haut du menu bascule en mode édition : réordonner les pages
 * (flèches) et les masquer/afficher, directement dans la sidebar.
 */

import { useState, useEffect, useCallback } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  getVisibleMenu,
  getAllMenuInOrder,
  isHidden,
  setHidden,
  moveItem,
  subscribeMenuChanges,
} from "../menuConfig";

interface Props {
  connected: boolean;
  onLogout: () => void;
}

export function Layout({ connected, onLogout }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState(getVisibleMenu);
  const [allItems, setAllItems] = useState(getAllMenuInOrder);

  useEffect(() => {
    return subscribeMenuChanges(() => {
      setItems(getVisibleMenu());
      setAllItems(getAllMenuInOrder());
    });
  }, []);

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
          <button
            className={`nav-edit-btn ${editing ? "active" : ""}`}
            onClick={() => setEditing((v) => !v)}
            title={editing ? "Terminer" : "Organiser le menu"}
            aria-label="Organiser le menu"
          >
            &#9998;
          </button>
          <button className="nav-close" onClick={closeMenu} aria-label="Fermer">&times;</button>
        </div>

        {editing ? (
          <div className="nav-links nav-links-editing">
            {allItems.map((item, idx) => {
              const hidden = isHidden(item.id);
              return (
                <div key={item.id} className={`menu-item-row ${hidden ? "menu-item-hidden" : ""}`}>
                  <div className="menu-item-reorder">
                    <button
                      className="btn-reorder"
                      onClick={() => moveItem(item.id, -1)}
                      disabled={idx === 0}
                      aria-label="Monter"
                    >&#9650;</button>
                    <button
                      className="btn-reorder"
                      onClick={() => moveItem(item.id, 1)}
                      disabled={idx === allItems.length - 1}
                      aria-label="Descendre"
                    >&#9660;</button>
                  </div>
                  <span className="menu-item-icon">{item.icon}</span>
                  <span className="menu-item-label">{item.label}</span>
                  <button
                    className={`menu-visibility-toggle ${hidden ? "" : "active"}`}
                    onClick={() => setHidden(item.id, !hidden)}
                  >
                    {hidden ? "Masqué" : "Visible"}
                  </button>
                </div>
              );
            })}
            <button className="btn-confirm-routine nav-edit-done" onClick={() => setEditing(false)}>
              Terminer
            </button>
          </div>
        ) : (
          <div className="nav-links">
            {items.map((item) => (
              <NavLink
                key={item.id}
                to={item.path}
                end={item.path === "/"}
                className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
                onClick={closeMenu}
              >
                <span className="nav-icon">{item.icon}</span>
                <span className="nav-label">{item.label}</span>
              </NavLink>
            ))}
          </div>
        )}

        <div className="nav-footer">
          <div className="nav-holo-links">
            <a href="/hologram-1" className="btn-hologram" target="_blank" rel="noopener">1 face</a>
            <a href="/hologram-2" className="btn-hologram" target="_blank" rel="noopener">2 faces</a>
            <a href="/hologram-3" className="btn-hologram" target="_blank" rel="noopener">3 faces</a>
          </div>
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
