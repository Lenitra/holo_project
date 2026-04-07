/**
 * Page Debug : actions rapides, appareils connectés, logs WebSocket.
 * Le status est actualisé automatiquement toutes les 5 secondes.
 */

import { useEffect } from "react";

interface WSMessage {
  type: string;
  payload: Record<string, unknown>;
}

interface ClientInfo {
  id: string;
  role: string;
}

interface Props {
  connected: boolean;
  clients: ClientInfo[];
  log: string[];
  onSend: (msg: WSMessage) => void;
  onSeen: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  hologram: "Hologramme",
  remote: "Télécommande",
  unknown: "Inconnu",
};

const ROLE_ICONS: Record<string, string> = {
  hologram: "◇",
  remote: "◈",
  unknown: "○",
};

export function DebugPage({ connected, clients, log, onSend, onSeen }: Props) {
  // Marquer les messages comme lus
  useEffect(() => {
    onSeen();
  }, [log.length, onSeen]);

  // Auto-refresh status toutes les 5s
  useEffect(() => {
    if (!connected) return;
    const interval = setInterval(() => {
      onSend({ type: "status", payload: {} });
    }, 5000);
    return () => clearInterval(interval);
  }, [connected, onSend]);

  const handleSend = (type: string, payload: Record<string, unknown> = {}) => {
    onSend({ type, payload });
  };

  return (
    <div className="debug-page">
      <h2 className="page-title">Debug</h2>

      {/* Actions rapides */}
      <div className="remote-actions">
        <button className="action-btn" onClick={() => handleSend("ping")} disabled={!connected}>Ping</button>
        <button className="action-btn" onClick={() => handleSend("status")} disabled={!connected}>Status</button>
        <button className="action-btn" onClick={() => handleSend("display.restart")} disabled={!connected}>Restart Holo</button>
      </div>

      {/* Appareils connectés */}
      <div className="remote-clients">
        <h3>Appareils ({clients.length})</h3>
        <div className="clients-list">
          {clients.length === 0 && <p className="log-empty">Aucun appareil</p>}
          {clients.map((c) => (
            <div key={c.id} className={`client-card client-${c.role}`}>
              <span className="client-icon">{ROLE_ICONS[c.role] || "○"}</span>
              <div className="client-info">
                <span className="client-id">{c.id}</span>
                <span className="client-role">{ROLE_LABELS[c.role] || c.role}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Logs */}
      <div className="remote-log">
        <h3>Messages ({log.length})</h3>
        <div className="log-entries">
          {log.length === 0 && <p className="log-empty">Aucun message</p>}
          {log.map((entry, i) => (
            <div key={i} className={`log-entry ${entry.startsWith("→") ? "sent" : "received"}`}>{entry}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
