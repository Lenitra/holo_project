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

interface Routine {
  id: string;
  name: string;
  action: string;
  time: string;
  days: number[];
  enabled: boolean;
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

const DAY_LABELS = ["L", "M", "Me", "J", "V", "S", "D"];

const ACTION_LABELS: Record<string, string> = {
  "weather.tts": "Météo TTS",
};

export function RemotePanel({ connected, lastMessage, send, onLogout }: Props) {
  const [log, setLog] = useState<string[]>([]);
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("Météo matin");
  const [newTime, setNewTime] = useState("07:30");
  const [newDays, setNewDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const lastProcessed = useRef<WSMessage | null>(null);

  // Demander le status et les routines à la connexion
  useEffect(() => {
    if (connected) {
      send({ type: "status", payload: {} });
      send({ type: "routine.list", payload: {} });
    }
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

    // Mettre à jour les routines
    if (lastMessage.type === "routine.list") {
      setRoutines(lastMessage.payload.routines as Routine[]);
    }
    if (lastMessage.type === "routine.added") {
      setRoutines((prev) => [...prev, lastMessage.payload as unknown as Routine]);
      setShowAddForm(false);
    }
    if (lastMessage.type === "routine.updated") {
      const updated = lastMessage.payload as unknown as Routine;
      setRoutines((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    }
    if (lastMessage.type === "routine.deleted") {
      const id = lastMessage.payload.id as string;
      setRoutines((prev) => prev.filter((r) => r.id !== id));
    }

    setLog((prev) => [...prev.slice(-19), `← ${lastMessage.type}: ${JSON.stringify(lastMessage.payload)}`]);
  }, [lastMessage]);

  const handleSend = (type: string, payload: Record<string, unknown> = {}) => {
    send({ type, payload });
    setLog((prev) => [...prev.slice(-19), `→ ${type} ${Object.keys(payload).length ? JSON.stringify(payload) : ""}`]);
  };

  const toggleDay = (day: number) => {
    setNewDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort());
  };

  const handleAddRoutine = () => {
    if (!newName.trim() || !newTime || newDays.length === 0) return;
    handleSend("routine.add", { name: newName.trim(), action: "weather.tts", time: newTime, days: newDays });
  };

  const toggleRoutine = (r: Routine) => {
    handleSend("routine.update", { id: r.id, enabled: !r.enabled });
  };

  const deleteRoutine = (id: string) => {
    handleSend("routine.delete", { id });
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

      <div className="remote-actions">
        <button className="action-btn action-btn-weather" onClick={() => handleSend("weather.tts")} disabled={!connected}>
          Météo Toulouse
        </button>
      </div>

      {/* Routines */}
      <div className="remote-routines">
        <div className="routines-header">
          <h3>Routines ({routines.length})</h3>
          <button
            className="btn-add-routine"
            onClick={() => setShowAddForm(!showAddForm)}
            disabled={!connected}
          >
            {showAddForm ? "Annuler" : "+ Ajouter"}
          </button>
        </div>

        {showAddForm && (
          <div className="routine-form">
            <input
              type="text"
              className="routine-input"
              placeholder="Nom de la routine"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <div className="routine-form-row">
              <input
                type="time"
                className="routine-input routine-time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
              />
              <span className="routine-action-tag">{ACTION_LABELS["weather.tts"]}</span>
            </div>
            <div className="routine-days-pick">
              {DAY_LABELS.map((label, i) => (
                <button
                  key={i}
                  className={`day-btn ${newDays.includes(i + 1) ? "active" : ""}`}
                  onClick={() => toggleDay(i + 1)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button className="btn-confirm-routine" onClick={handleAddRoutine} disabled={newDays.length === 0}>
              Créer la routine
            </button>
          </div>
        )}

        <div className="routines-list">
          {routines.length === 0 && !showAddForm && <p className="log-empty">Aucune routine</p>}
          {routines.map((r) => (
            <div key={r.id} className={`routine-card ${r.enabled ? "" : "routine-disabled"}`}>
              <div className="routine-card-left" onClick={() => toggleRoutine(r)}>
                <span className={`routine-toggle ${r.enabled ? "on" : "off"}`} />
                <div className="routine-card-info">
                  <span className="routine-name">{r.name}</span>
                  <span className="routine-schedule">
                    {r.time} — {r.days.map((d) => DAY_LABELS[d - 1]).join(", ")}
                  </span>
                </div>
              </div>
              <button className="btn-delete-routine" onClick={() => deleteRoutine(r.id)}>×</button>
            </div>
          ))}
        </div>
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
