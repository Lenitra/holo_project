/**
 * Page dashboard : actions principales, routines, et réglages des modules
 * utilisés ici (ville météo, voix de l'assistant, musiques de réveil).
 */

import { useState, useEffect } from "react";
import { Fold } from "../components/Fold";
import { CitySettings } from "../components/CitySettings";
import { VoiceSettings } from "../components/VoiceSettings";
import { MusicLibrary } from "../components/MusicLibrary";

interface WSMessage {
  type: string;
  payload: Record<string, unknown>;
}

interface Routine {
  id: string;
  name: string;
  action: string;
  time: string;
  days: number[];
  enabled: boolean;
  config: Record<string, unknown>;
}

interface MusicFile {
  name: string;
  size: number;
}

interface Props {
  connected: boolean;
  routines: Routine[];
  lastMessage: WSMessage | null;
  onSend: (msg: WSMessage) => void;
}

const DAY_LABELS = ["L", "M", "Me", "J", "V", "S", "D"];

const CATEGORY_LABELS: Record<string, string> = {
  "weather.tts": "Météo",
  alarm: "Réveil",
};

const API_BASE = import.meta.env.DEV ? "http://localhost:3000" : "";

export function DashboardPage({ connected, routines, lastMessage, onSend }: Props) {
  const [displayOff, setDisplayOff] = useState(false);
  // null = fermé, undefined = création, string = id de la routine éditée
  const [editingId, setEditingId] = useState<string | null | undefined>(null);
  const [formName, setFormName] = useState("");
  const [formTime, setFormTime] = useState("07:30");
  const [formDays, setFormDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [formAction, setFormAction] = useState<"weather.tts" | "alarm">("alarm");
  const [formMusic, setFormMusic] = useState("");
  const [formWeatherDelay, setFormWeatherDelay] = useState(5);
  const [musicFiles, setMusicFiles] = useState<MusicFile[]>([]);

  const formOpen = editingId !== null;
  const isEditing = typeof editingId === "string";

  // Charger la liste des MP3 quand le formulaire s'ouvre
  useEffect(() => {
    if (!formOpen) return;
    fetch(`${API_BASE}/api/music`)
      .then((r) => r.json())
      .then((d) => {
        setMusicFiles(d.files || []);
        if (d.files?.length && !formMusic) setFormMusic(d.files[0].name);
      })
      .catch(() => {});
  }, [formOpen]);

  const handleSend = (type: string, payload: Record<string, unknown> = {}) => {
    onSend({ type, payload });
  };

  const toggleDay = (day: number) => {
    setFormDays((prev) => prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort());
  };

  const openCreateForm = () => {
    setEditingId(undefined);
    setFormName("");
    setFormTime("07:30");
    setFormDays([1, 2, 3, 4, 5]);
    setFormAction("alarm");
    setFormMusic("");
    setFormWeatherDelay(5);
  };

  const openEditForm = (r: Routine) => {
    setEditingId(r.id);
    setFormName(r.name);
    setFormTime(r.time);
    setFormDays([...r.days]);
    setFormAction(r.action as "weather.tts" | "alarm");
    setFormMusic(String(r.config?.music || ""));
    setFormWeatherDelay(Number(r.config?.weather_delay ?? 5));
  };

  const closeForm = () => setEditingId(null);

  const buildConfig = (): Record<string, unknown> => {
    if (formAction !== "alarm") return {};
    return { music: formMusic, weather_delay: formWeatherDelay };
  };

  const handleSubmit = () => {
    if (!formName.trim() || !formTime || formDays.length === 0) return;
    if (formAction === "alarm" && !formMusic) return;

    const config = buildConfig();

    if (isEditing) {
      handleSend("routine.update", {
        id: editingId,
        name: formName.trim(),
        action: formAction,
        time: formTime,
        days: formDays,
        config,
      });
    } else {
      handleSend("routine.add", {
        name: formName.trim(),
        action: formAction,
        time: formTime,
        days: formDays,
        config,
      });
    }
    closeForm();
  };

  const toggleRoutine = (r: Routine) => {
    handleSend("routine.update", { id: r.id, enabled: !r.enabled });
  };

  const deleteRoutine = (id: string) => {
    handleSend("routine.delete", { id });
  };

  return (
    <div className="dashboard-page">
      <h2 className="page-title">Dashboard</h2>

      <div className="remote-actions">
        <button className="action-btn action-btn-weather" onClick={() => handleSend("weather.tts")} disabled={!connected}>
          Météo
        </button>
        <button
          className={`action-btn ${displayOff ? "action-btn-on" : "action-btn-off"}`}
          onClick={() => {
            if (displayOff) {
              handleSend("display.update", { screen: "idle" });
            } else {
              handleSend("display.update", { screen: "off" });
            }
            setDisplayOff(!displayOff);
          }}
          disabled={!connected}
        >
          {displayOff ? "Allumer" : "Éteindre"}
        </button>
      </div>

      {/* Routines */}
      <div className="remote-routines">
        <div className="routines-header">
          <h3>Routines ({routines.length})</h3>
          <button
            className="btn-add-routine"
            onClick={() => { if (formOpen) closeForm(); else openCreateForm(); }}
            disabled={!connected}
          >
            {formOpen ? "Annuler" : "+ Ajouter"}
          </button>
        </div>

        {formOpen && (
          <div className="routine-form">
            {/* Sélecteur de catégorie */}
            <div className="routine-category-pick">
              {(["alarm", "weather.tts"] as const).map((cat) => (
                <button
                  key={cat}
                  className={`category-btn ${formAction === cat ? "active" : ""}`}
                  onClick={() => setFormAction(cat)}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>

            <input
              type="text"
              className="routine-input"
              placeholder="Nom de la routine"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />

            <div className="routine-form-row">
              <input
                type="time"
                className="routine-input routine-time"
                value={formTime}
                onChange={(e) => setFormTime(e.target.value)}
              />
              <span className="routine-action-tag">{CATEGORY_LABELS[formAction]}</span>
            </div>

            {/* Config spécifique alarm */}
            {formAction === "alarm" && (
              <div className="alarm-config">
                <label className="config-label">Musique</label>
                {musicFiles.length === 0 ? (
                  <p className="config-hint">Aucun MP3 — ajoutez-en dans « Musiques réveil » plus bas</p>
                ) : (
                  <select
                    className="routine-input"
                    value={formMusic}
                    onChange={(e) => setFormMusic(e.target.value)}
                  >
                    {musicFiles.map((f) => (
                      <option key={f.name} value={f.name}>{f.name}</option>
                    ))}
                  </select>
                )}
                <label className="config-label">Météo après arrêt (min)</label>
                <div className="routine-form-row">
                  <input
                    type="number"
                    className="routine-input"
                    min={-1}
                    max={60}
                    value={formWeatherDelay}
                    onChange={(e) => setFormWeatherDelay(parseInt(e.target.value) ?? 0)}
                  />
                  <span className="config-hint">
                    {formWeatherDelay < 0 ? "Désactivé" : formWeatherDelay === 0 ? "Immédiat" : `${formWeatherDelay} min`}
                  </span>
                </div>
              </div>
            )}

            <div className="routine-days-pick">
              {DAY_LABELS.map((label, i) => (
                <button
                  key={i}
                  className={`day-btn ${formDays.includes(i + 1) ? "active" : ""}`}
                  onClick={() => toggleDay(i + 1)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              className="btn-confirm-routine"
              onClick={handleSubmit}
              disabled={formDays.length === 0 || (formAction === "alarm" && !formMusic)}
            >
              {isEditing ? "Enregistrer" : "Créer la routine"}
            </button>
          </div>
        )}

        <div className="routines-list">
          {routines.length === 0 && !formOpen && <p className="log-empty">Aucune routine</p>}
          {routines.map((r) => (
            <div key={r.id} className={`routine-card ${r.enabled ? "" : "routine-disabled"} ${editingId === r.id ? "routine-editing" : ""}`}>
              <div className="routine-card-left" onClick={() => toggleRoutine(r)}>
                <span className={`routine-toggle ${r.enabled ? "on" : "off"}`} />
                <div className="routine-card-info">
                  <div className="routine-name-row">
                    <span className="routine-name">{r.name}</span>
                    <span className={`routine-cat-badge cat-${r.action}`}>
                      {CATEGORY_LABELS[r.action] || r.action}
                    </span>
                  </div>
                  <span className="routine-schedule">
                    {r.time} — {r.days.map((d) => DAY_LABELS[d - 1]).join(", ")}
                    {r.action === "alarm" && r.config?.music ? ` — ${String(r.config.music)}` : ""}
                  </span>
                </div>
              </div>
              <button className="btn-edit-routine" onClick={() => openEditForm(r)}>&#9998;</button>
              <button className="btn-delete-routine" onClick={() => deleteRoutine(r.id)}>×</button>
            </div>
          ))}
        </div>
      </div>

      {/* Réglages des modules utilisés sur cette page */}
      <Fold title="Ville météo">
        <CitySettings />
      </Fold>
      <Fold title="Voix de l'assistant">
        <VoiceSettings connected={connected} lastMessage={lastMessage} onSend={onSend} />
      </Fold>
      <Fold title="Musiques réveil">
        <MusicLibrary />
      </Fold>
    </div>
  );
}
