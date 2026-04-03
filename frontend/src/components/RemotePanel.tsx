/**
 * Panneau principal de la télécommande.
 */

import { useState, useEffect, useRef } from "react";

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
  lastMessage: WSMessage | null;
  send: (msg: WSMessage) => void;
  onLogout: () => void;
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

export function RemotePanel({ connected, lastMessage, send, onLogout }: Props) {
  const [log, setLog] = useState<string[]>([]);
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const lastProcessed = useRef<WSMessage | null>(null);

  // Demander le status à la connexion
  useEffect(() => {
    if (connected) send({ type: "status", payload: {} });
  }, [connected]);

  // Traiter les messages reçus
  useEffect(() => {
    if (!lastMessage || lastMessage === lastProcessed.current) return;
    lastProcessed.current = lastMessage;

    // Mettre à jour la liste des clients si c'est un status
    if (lastMessage.type === "status" && lastMessage.payload.clients) {
      const raw = lastMessage.payload.clients as Record<string, { role: string }>;
      setClients(Object.entries(raw).map(([id, info]) => ({ id, role: info.role })));
    }

    setLog((prev) => [...prev.slice(-19), `← ${lastMessage.type}: ${JSON.stringify(lastMessage.payload)}`]);
  }, [lastMessage]);

  const handleSend = (type: string, payload: Record<string, unknown> = {}) => {
    send({ type, payload });
    setLog((prev) => [...prev.slice(-19), `→ ${type} ${Object.keys(payload).length ? JSON.stringify(payload) : ""}`]);
  };

  return (
    <div className="remote-panel">
      <div className="remote-header">
        <h1>Holo Remote</h1>
        <div className="remote-header-right">
          <span className={`status-dot ${connected ? "online" : "offline"}`} />
          <span className="status-text">{connected ? "Connecté" : "Déconnecté"}</span>
          <button className="btn-logout" onClick={onLogout}>Déconnexion</button>
        </div>
      </div>

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

      <div className="remote-log">
        <h3>Messages</h3>
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
