/**
 * Page Debug : actions rapides, appareils connectés, logs WebSocket.
 * Le status est actualisé automatiquement toutes les 5 secondes.
 */

import { useEffect, useState } from "react";
import { ConfirmModal } from "../components/ConfirmModal";

const API_BASE = import.meta.env.DEV ? "http://localhost:3000" : "";

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
  token: string | null;
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

export function DebugPage({ connected, clients, log, onSend, token }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

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

  const handleUpdate = async () => {
    setConfirmOpen(false);
    setUpdating(true);
    setUpdateMsg("Mise à jour et redémarrage en cours…");
    try {
      const res = await fetch(`${API_BASE}/api/system/update`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setUpdateMsg("Redémarrage lancé — reconnexion dans quelques instants…");
      } else {
        setUpdateMsg(data.error || "Échec de la mise à jour.");
        setUpdating(false);
      }
    } catch {
      // La coupure de connexion est attendue quand le serveur redémarre.
      setUpdateMsg("Redémarrage en cours — reconnexion dans quelques instants…");
    }
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

      {/* Système : mise à jour + redémarrage complet */}
      <div className="remote-system">
        <h3>Système</h3>
        <button
          className="action-btn action-btn-off"
          onClick={() => setConfirmOpen(true)}
          disabled={updating}
        >
          {updating ? "Redémarrage en cours…" : "Mettre à jour & Redémarrer"}
        </button>
        {updateMsg && <p className="system-msg">{updateMsg}</p>}
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Mettre à jour & Redémarrer"
        message="Le projet va être mis à jour (git pull) puis toute la stack va redémarrer. L'hologramme et la télécommande seront indisponibles quelques instants."
        confirmLabel="Mettre à jour"
        cancelLabel="Annuler"
        onConfirm={handleUpdate}
        onCancel={() => setConfirmOpen(false)}
      />

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
