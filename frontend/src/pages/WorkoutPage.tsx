/**
 * Page Workout (WoD) : séances type et suivi de progression.
 */

import { useState, useEffect, useRef } from "react";
import { ConfirmModal } from "../components/ConfirmModal";

interface WSMessage {
  type: string;
  payload: Record<string, unknown>;
}

type Category = "max_reps" | "max_time";

interface Workout {
  id: string;
  name: string;
  description: string;
  category: Category;
}

interface Session {
  id: string;
  workout_id: string;
  date: string;
  value: number;
  notes: string;
}

interface Props {
  connected: boolean;
  lastMessage: WSMessage | null;
  onSend: (msg: WSMessage) => void;
}

const CATEGORY_LABELS: Record<Category, string> = {
  max_reps: "Max reps",
  max_time: "Max time",
};

// Formate une valeur selon la catégorie
function formatValue(value: number, category: Category): string {
  if (category === "max_reps") return `${Math.round(value)} reps`;
  const mins = Math.floor(value / 60);
  const secs = Math.round(value % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Parse un input "mm:ss" ou un nombre de secondes en nombre
function parseTime(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed.includes(":")) {
    const [m, s] = trimmed.split(":").map((p) => parseInt(p, 10));
    if (isNaN(m) || isNaN(s)) return null;
    return m * 60 + s;
  }
  const n = parseInt(trimmed, 10);
  return isNaN(n) ? null : n;
}

// "2026-04-14T10:30:00" → "14/04/2026 10:30"
function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Comparaison : "better" = plus pour max_reps, moins pour max_time
function progression(value: number, prev: number, category: Category): "better" | "worse" | "same" {
  if (value === prev) return "same";
  if (category === "max_reps") return value > prev ? "better" : "worse";
  return value < prev ? "better" : "worse";
}

export function WorkoutPage({ connected, lastMessage, onSend }: Props) {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [sessions, setSessions] = useState<Record<string, Session[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [workoutToDelete, setWorkoutToDelete] = useState<Workout | null>(null);
  const lastProcessed = useRef<WSMessage | null>(null);

  // Formulaire nouveau workout
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCategory, setNewCategory] = useState<Category>("max_reps");

  // Formulaire nouvelle session
  const [sessionValue, setSessionValue] = useState("");
  const [sessionNotes, setSessionNotes] = useState("");

  // Charger à la connexion
  useEffect(() => {
    if (connected) onSend({ type: "workout.list", payload: {} });
  }, [connected]);

  // Quand on sélectionne un workout, charger ses sessions
  useEffect(() => {
    if (selectedId && connected) {
      onSend({ type: "workout.sessions", payload: { workout_id: selectedId } });
    }
  }, [selectedId, connected]);

  // Traiter les messages workout
  useEffect(() => {
    if (!lastMessage || lastMessage === lastProcessed.current) return;
    if (!lastMessage.type.startsWith("workout.")) return;
    lastProcessed.current = lastMessage;

    switch (lastMessage.type) {
      case "workout.list":
        setWorkouts(lastMessage.payload.workouts as Workout[]);
        break;
      case "workout.added":
        setWorkouts((prev) => [...prev, lastMessage.payload as unknown as Workout]);
        setShowAddForm(false);
        setNewName("");
        setNewDescription("");
        break;
      case "workout.updated": {
        const updated = lastMessage.payload as unknown as Workout;
        setWorkouts((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
        break;
      }
      case "workout.deleted": {
        const id = lastMessage.payload.id as string;
        setWorkouts((prev) => prev.filter((w) => w.id !== id));
        setSessions((prev) => {
          const { [id]: _removed, ...rest } = prev;
          return rest;
        });
        if (selectedId === id) setSelectedId(null);
        break;
      }
      case "workout.sessions": {
        const workoutId = lastMessage.payload.workout_id as string;
        const list = lastMessage.payload.sessions as Session[];
        setSessions((prev) => ({ ...prev, [workoutId]: list }));
        break;
      }
      case "workout.session.added": {
        const session = lastMessage.payload as unknown as Session;
        setSessions((prev) => ({
          ...prev,
          [session.workout_id]: [...(prev[session.workout_id] || []), session],
        }));
        setSessionValue("");
        setSessionNotes("");
        break;
      }
      case "workout.session.deleted": {
        const id = lastMessage.payload.id as string;
        setSessions((prev) => {
          const next: Record<string, Session[]> = {};
          for (const [wid, list] of Object.entries(prev)) {
            next[wid] = list.filter((s) => s.id !== id);
          }
          return next;
        });
        break;
      }
    }
  }, [lastMessage, selectedId]);

  const handleAddWorkout = () => {
    if (!newName.trim()) return;
    onSend({
      type: "workout.add",
      payload: {
        name: newName.trim(),
        description: newDescription.trim(),
        category: newCategory,
      },
    });
  };

  const handleAddSession = () => {
    if (!selectedId) return;
    const workout = workouts.find((w) => w.id === selectedId);
    if (!workout) return;

    let value: number | null;
    if (workout.category === "max_time") {
      value = parseTime(sessionValue);
    } else {
      const n = parseInt(sessionValue.trim(), 10);
      value = isNaN(n) ? null : n;
    }
    if (value === null || value < 0) return;

    onSend({
      type: "workout.session.add",
      payload: { workout_id: selectedId, value, notes: sessionNotes.trim() },
    });
  };

  const confirmDeleteWorkout = () => {
    if (!workoutToDelete) return;
    onSend({ type: "workout.delete", payload: { id: workoutToDelete.id } });
    setWorkoutToDelete(null);
  };

  const deleteSession = (id: string) => {
    onSend({ type: "workout.session.delete", payload: { id } });
  };

  // ── Vue détail ──────────────────────────────────────────────────
  if (selectedId) {
    const workout = workouts.find((w) => w.id === selectedId);
    if (!workout) {
      setSelectedId(null);
      return null;
    }

    const list = sessions[selectedId] || [];
    const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date)); // récent → ancien

    return (
      <div className="workout-page">
        <button className="btn-back" onClick={() => setSelectedId(null)}>← Retour</button>
        <div className="workout-detail-header">
          <h2 className="page-title">{workout.name}</h2>
          <span className={`routine-cat-badge cat-${workout.category}`}>
            {CATEGORY_LABELS[workout.category]}
          </span>
        </div>
        {workout.description && (
          <div className="workout-description-card">
            <h3 className="workout-description-label">Exercices</h3>
            <p className="workout-description">{workout.description}</p>
          </div>
        )}

        {/* Formulaire nouvelle session */}
        <div className="workout-session-form">
          <h3>Nouveau résultat</h3>
          <div className="routine-form-row">
            <input
              type="text"
              className="routine-input"
              placeholder={workout.category === "max_time" ? "mm:ss ou secondes" : "Nombre de reps"}
              value={sessionValue}
              onChange={(e) => setSessionValue(e.target.value)}
              disabled={!connected}
            />
            <button
              className="btn-confirm-routine"
              onClick={handleAddSession}
              disabled={!connected || !sessionValue.trim()}
            >
              Ajouter
            </button>
          </div>
          <input
            type="text"
            className="routine-input"
            placeholder="Notes (optionnel)"
            value={sessionNotes}
            onChange={(e) => setSessionNotes(e.target.value)}
            disabled={!connected}
          />
        </div>

        {/* Historique */}
        <div className="workout-history">
          <h3>Historique ({list.length})</h3>
          {sorted.length === 0 && <p className="log-empty">Aucun résultat</p>}
          {sorted.map((s, i) => {
            // Session précédente chronologiquement = suivante dans le tableau trié desc
            const prev = sorted[i + 1];
            const trend = prev ? progression(s.value, prev.value, workout.category) : null;
            return (
              <div key={s.id} className="workout-session-card">
                <div className="workout-session-main">
                  <span className="workout-session-value">
                    {formatValue(s.value, workout.category)}
                  </span>
                  {trend && (
                    <span className={`workout-trend trend-${trend}`}>
                      {trend === "better" ? "▲" : trend === "worse" ? "▼" : "="}
                    </span>
                  )}
                  <span className="workout-session-date">{formatDate(s.date)}</span>
                </div>
                {s.notes && <span className="workout-session-notes">{s.notes}</span>}
                <button className="btn-delete-routine" onClick={() => deleteSession(s.id)}>×</button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Vue liste ───────────────────────────────────────────────────
  return (
    <div className="workout-page">
      <h2 className="page-title">Workouts</h2>

      <div className="routines-header">
        <h3>Séances ({workouts.length})</h3>
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
          <div className="routine-category-pick">
            {(["max_reps", "max_time"] as const).map((cat) => (
              <button
                key={cat}
                className={`category-btn ${newCategory === cat ? "active" : ""}`}
                onClick={() => setNewCategory(cat)}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
          <input
            type="text"
            className="routine-input"
            placeholder="Nom (ex: Fran)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <textarea
            className="routine-input"
            placeholder="Description (optionnel)"
            rows={3}
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
          />
          <button
            className="btn-confirm-routine"
            onClick={handleAddWorkout}
            disabled={!newName.trim()}
          >
            Créer
          </button>
        </div>
      )}

      <div className="workouts-list">
        {workouts.length === 0 && !showAddForm && <p className="log-empty">Aucune séance</p>}
        {workouts.map((w) => {
          const list = sessions[w.id] || [];
          const last = list.length > 0 ? list[list.length - 1] : null;
          return (
            <div key={w.id} className="workout-card" onClick={() => setSelectedId(w.id)}>
              <div className="workout-card-info">
                <div className="routine-name-row">
                  <span className="routine-name">{w.name}</span>
                  <span className={`routine-cat-badge cat-${w.category}`}>
                    {CATEGORY_LABELS[w.category]}
                  </span>
                </div>
                {last && (
                  <span className="workout-card-last">
                    Dernier : {formatValue(last.value, w.category)}
                  </span>
                )}
              </div>
              <button
                className="btn-delete-routine"
                onClick={(e) => { e.stopPropagation(); setWorkoutToDelete(w); }}
              >×</button>
            </div>
          );
        })}
      </div>

      <ConfirmModal
        open={workoutToDelete !== null}
        title="Supprimer la séance"
        message={
          workoutToDelete
            ? `Supprimer "${workoutToDelete.name}" ? Tous les résultats enregistrés seront aussi supprimés.`
            : ""
        }
        onConfirm={confirmDeleteWorkout}
        onCancel={() => setWorkoutToDelete(null)}
      />
    </div>
  );
}
