/**
 * Page Workout : gestion des exercices, séances et suivi de progression.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { ConfirmModal } from "../components/ConfirmModal";

interface WSMessage {
  type: string;
  payload: Record<string, unknown>;
}

interface Exercise {
  id: string;
  title: string;
  description: string;
}

interface WorkoutExercise {
  exercise_id: string;
  reps: number | null;
  duration: number | null;
  description: string;
}

interface Workout {
  id: string;
  name: string;
  description: string;
  exercises: WorkoutExercise[];
}

interface Session {
  id: string;
  workout_id: string;
  date: string;
  result: string;
  notes: string;
}

interface Props {
  connected: boolean;
  lastMessage: WSMessage | null;
  onSend: (msg: WSMessage) => void;
}

type Tab = "exercises" | "seances";

// Formate une durée en secondes → "mm:ss"
function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// Parse un input "mm:ss" ou un nombre de secondes
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

export function WorkoutPage({ connected, lastMessage, onSend }: Props) {
  const [tab, setTab] = useState<Tab>("seances");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [sessions, setSessions] = useState<Record<string, Session[]>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const lastProcessed = useRef<WSMessage | null>(null);

  // Formulaire exercice (création + édition)
  const [showExerciseForm, setShowExerciseForm] = useState(false);
  const [editingExerciseId, setEditingExerciseId] = useState<string | null>(null);
  const [exTitle, setExTitle] = useState("");
  const [exDescription, setExDescription] = useState("");
  const [exerciseToDelete, setExerciseToDelete] = useState<Exercise | null>(null);

  // Formulaire séance (création + édition)
  const [showWorkoutForm, setShowWorkoutForm] = useState(false);
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [wName, setWName] = useState("");
  const [wDescription, setWDescription] = useState("");
  const [wExercises, setWExercises] = useState<WorkoutExercise[]>([]);
  const [workoutToDelete, setWorkoutToDelete] = useState<Workout | null>(null);

  // Formulaire session (résultat)
  const [sessionValue, setSessionValue] = useState("");
  const [sessionNotes, setSessionNotes] = useState("");

  // Durée brute (texte) par index d'exercice dans le formulaire séance
  const [durationInputs, setDurationInputs] = useState<Record<number, string>>({});

  // Édition de séance dans la vue détail
  const [editingDetail, setEditingDetail] = useState(false);
  const [editDetailName, setEditDetailName] = useState("");
  const [editDetailDescription, setEditDetailDescription] = useState("");
  const [editDetailExercises, setEditDetailExercises] = useState<WorkoutExercise[]>([]);
  const [editDetailDurationInputs, setEditDetailDurationInputs] = useState<Record<number, string>>({});

  // Player
  const [playingWorkout, setPlayingWorkout] = useState<Workout | null>(null);
  const [playerStep, setPlayerStep] = useState(0);
  const [playerPhase, setPlayerPhase] = useState<"exercise" | "done">("exercise");
  const [totalElapsed, setTotalElapsed] = useState(0);
  const [exTimer, setExTimer] = useState<number | null>(null); // countdown exercice (null = pas actif)
  const [totalPaused, setTotalPaused] = useState(false);
  const [exPaused, setExPaused] = useState(false);
  const totalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const exTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Charger à la connexion
  useEffect(() => {
    if (connected) {
      onSend({ type: "exercise.list", payload: {} });
      onSend({ type: "workout.list", payload: {} });
    }
  }, [connected]);

  // Quand on sélectionne une séance, charger ses sessions
  useEffect(() => {
    if (selectedId && connected) {
      onSend({ type: "workout.sessions", payload: { workout_id: selectedId } });
    }
  }, [selectedId, connected]);

  // Traiter les messages
  useEffect(() => {
    if (!lastMessage || lastMessage === lastProcessed.current) return;
    if (
      !lastMessage.type.startsWith("workout.") &&
      !lastMessage.type.startsWith("exercise.")
    )
      return;
    lastProcessed.current = lastMessage;

    switch (lastMessage.type) {
      // Exercices
      case "exercise.list":
        setExercises(lastMessage.payload.exercises as Exercise[]);
        break;
      case "exercise.added":
        setExercises((prev) => [...prev, lastMessage.payload as unknown as Exercise]);
        resetExerciseForm();
        break;
      case "exercise.updated": {
        const updated = lastMessage.payload as unknown as Exercise;
        setExercises((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
        resetExerciseForm();
        break;
      }
      case "exercise.deleted": {
        const id = lastMessage.payload.id as string;
        setExercises((prev) => prev.filter((e) => e.id !== id));
        break;
      }

      // Séances
      case "workout.list":
        setWorkouts(lastMessage.payload.workouts as Workout[]);
        break;
      case "workout.added":
        setWorkouts((prev) => [...prev, lastMessage.payload as unknown as Workout]);
        resetWorkoutForm();
        break;
      case "workout.updated": {
        const updated = lastMessage.payload as unknown as Workout;
        setWorkouts((prev) => prev.map((w) => (w.id === updated.id ? updated : w)));
        resetWorkoutForm();
        setEditingDetail(false);
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

      // Sessions
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

  // ── Helpers ──────────────────────────────────────────────────────

  const getExerciseTitle = (exerciseId: string): string => {
    const ex = exercises.find((e) => e.id === exerciseId);
    return ex ? ex.title : "Exercice inconnu";
  };

  const resetExerciseForm = () => {
    setShowExerciseForm(false);
    setEditingExerciseId(null);
    setExTitle("");
    setExDescription("");
  };

  const resetWorkoutForm = () => {
    setShowWorkoutForm(false);
    setEditingWorkoutId(null);
    setWName("");
    setWDescription("");
    setWExercises([]);
    setDurationInputs({});
  };

  const startEditExercise = (ex: Exercise) => {
    setEditingExerciseId(ex.id);
    setExTitle(ex.title);
    setExDescription(ex.description);
    setShowExerciseForm(true);
  };

  const startEditWorkout = (w: Workout) => {
    setEditingWorkoutId(w.id);
    setWName(w.name);
    setWDescription(w.description);
    setWExercises([...w.exercises]);
    setDurationInputs({});
    setShowWorkoutForm(true);
  };

  const handleSubmitExercise = () => {
    if (!exTitle.trim()) return;
    if (editingExerciseId) {
      onSend({
        type: "exercise.update",
        payload: { id: editingExerciseId, title: exTitle.trim(), description: exDescription.trim() },
      });
    } else {
      onSend({
        type: "exercise.add",
        payload: { title: exTitle.trim(), description: exDescription.trim() },
      });
    }
  };

  const handleSubmitWorkout = () => {
    if (!wName.trim()) return;
    if (editingWorkoutId) {
      onSend({
        type: "workout.update",
        payload: { id: editingWorkoutId, name: wName.trim(), description: wDescription.trim(), exercises: wExercises },
      });
    } else {
      onSend({
        type: "workout.add",
        payload: { name: wName.trim(), description: wDescription.trim(), exercises: wExercises },
      });
    }
  };

  const handleAddSession = () => {
    if (!selectedId || !sessionValue.trim()) return;
    onSend({
      type: "workout.session.add",
      payload: { workout_id: selectedId, result: sessionValue.trim(), notes: sessionNotes.trim() },
    });
  };

  const addExerciseToList = (_list: WorkoutExercise[], setList: React.Dispatch<React.SetStateAction<WorkoutExercise[]>>, exerciseId: string) => {
    setList((prev) => [
      ...prev,
      { exercise_id: exerciseId, reps: null, duration: null, description: "" },
    ]);
  };

  const removeExerciseFromList = (
    setList: React.Dispatch<React.SetStateAction<WorkoutExercise[]>>,
    setDur: React.Dispatch<React.SetStateAction<Record<number, string>>>,
    index: number
  ) => {
    setList((prev) => prev.filter((_, i) => i !== index));
    setDur((prev) => {
      const next: Record<number, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        const ki = parseInt(k, 10);
        if (ki < index) next[ki] = v;
        else if (ki > index) next[ki - 1] = v;
      }
      return next;
    });
  };

  const updateExerciseInList = (
    setList: React.Dispatch<React.SetStateAction<WorkoutExercise[]>>,
    index: number,
    field: keyof WorkoutExercise,
    value: string | number | null
  ) => {
    setList((prev) =>
      prev.map((ex, i) => (i === index ? { ...ex, [field]: value } : ex))
    );
  };

  const confirmDeleteExercise = () => {
    if (!exerciseToDelete) return;
    onSend({ type: "exercise.delete", payload: { id: exerciseToDelete.id } });
    setExerciseToDelete(null);
  };

  const confirmDeleteWorkout = () => {
    if (!workoutToDelete) return;
    onSend({ type: "workout.delete", payload: { id: workoutToDelete.id } });
    setWorkoutToDelete(null);
  };

  const deleteSession = (id: string) => {
    onSend({ type: "workout.session.delete", payload: { id } });
  };

  const startEditDetail = (w: Workout) => {
    setEditingDetail(true);
    setEditDetailName(w.name);
    setEditDetailDescription(w.description);
    setEditDetailExercises([...w.exercises]);
    setEditDetailDurationInputs({});
  };

  const handleSaveDetail = () => {
    if (!selectedId || !editDetailName.trim()) return;
    onSend({
      type: "workout.update",
      payload: {
        id: selectedId,
        name: editDetailName.trim(),
        description: editDetailDescription.trim(),
        exercises: editDetailExercises,
      },
    });
  };

  // ── Player ───────────────────────────────────────────────────────

  const stopExTimer = useCallback(() => {
    if (exTimerRef.current) { clearInterval(exTimerRef.current); exTimerRef.current = null; }
  }, []);

  const stopTotalTimer = useCallback(() => {
    if (totalRef.current) { clearInterval(totalRef.current); totalRef.current = null; }
  }, []);

  const startPlayer = (w: Workout) => {
    stopExTimer();
    stopTotalTimer();
    setPlayingWorkout(w);
    setPlayerStep(0);
    setPlayerPhase("exercise");
    setTotalElapsed(0);
    setExTimer(null);
    setTotalPaused(false);
    setExPaused(false);
    totalRef.current = setInterval(() => setTotalElapsed((t) => t + 1), 1000);
  };

  const toggleTotalPause = () => {
    if (totalPaused) {
      totalRef.current = setInterval(() => setTotalElapsed((t) => t + 1), 1000);
      setTotalPaused(false);
    } else {
      stopTotalTimer();
      setTotalPaused(true);
    }
  };

  const startExTimer = (duration: number) => {
    stopExTimer();
    setExTimer(duration);
    setExPaused(false);
    exTimerRef.current = setInterval(() => {
      setExTimer((t) => {
        if (t === null || t <= 1) {
          stopExTimer();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  };

  const toggleExPause = () => {
    if (exPaused) {
      exTimerRef.current = setInterval(() => {
        setExTimer((t) => {
          if (t === null || t <= 1) {
            stopExTimer();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
      setExPaused(false);
    } else {
      stopExTimer();
      setExPaused(true);
    }
  };

  const playerNext = () => {
    stopExTimer();
    setExTimer(null);
    setExPaused(false);
    if (!playingWorkout) return;
    if (playerStep >= playingWorkout.exercises.length - 1) {
      setPlayerPhase("done");
      stopTotalTimer();
      return;
    }
    setPlayerStep((s) => s + 1);
  };

  const stopPlayer = () => {
    stopExTimer();
    stopTotalTimer();
    setPlayingWorkout(null);
    setPlayerPhase("exercise");
  };

  // Cleanup timers on unmount
  useEffect(() => () => { stopExTimer(); stopTotalTimer(); }, [stopExTimer, stopTotalTimer]);

  // ── Composant formulaire exercices réutilisable ──────────────────

  const renderExerciseFields = (
    exList: WorkoutExercise[],
    setExList: React.Dispatch<React.SetStateAction<WorkoutExercise[]>>,
    durInputs: Record<number, string>,
    setDurInputs: React.Dispatch<React.SetStateAction<Record<number, string>>>
  ) => (
    <>
      {exList.length > 0 && (
        <div className="workout-form-exercises">
          <h4>Exercices de la séance</h4>
          {exList.map((wex, i) => (
            <div key={i} className="workout-form-exercise-row">
              <div className="workout-form-exercise-header">
                <span className="routine-name">
                  {getExerciseTitle(wex.exercise_id)}
                </span>
                <button
                  className="btn-delete-routine"
                  onClick={() => removeExerciseFromList(setExList, setDurInputs, i)}
                >
                  ×
                </button>
              </div>
              <div className="workout-form-exercise-fields">
                <input
                  type="number"
                  className="routine-input routine-input-small"
                  placeholder="Reps"
                  value={wex.reps ?? ""}
                  onChange={(e) =>
                    updateExerciseInList(setExList, i, "reps", e.target.value ? parseInt(e.target.value, 10) : null)
                  }
                />
                <input
                  type="text"
                  className="routine-input routine-input-small"
                  placeholder="Durée (mm:ss)"
                  value={durInputs[i] ?? (wex.duration != null ? formatDuration(wex.duration) : "")}
                  onChange={(e) => setDurInputs((prev) => ({ ...prev, [i]: e.target.value }))}
                  onBlur={() => {
                    const raw = durInputs[i];
                    if (raw !== undefined) {
                      updateExerciseInList(setExList, i, "duration", raw ? parseTime(raw) : null);
                      setDurInputs((prev) => { const { [i]: _, ...rest } = prev; return rest; });
                    }
                  }}
                />
                <input
                  type="text"
                  className="routine-input"
                  placeholder="Description supplémentaire"
                  value={wex.description}
                  onChange={(e) => updateExerciseInList(setExList, i, "description", e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {exercises.length > 0 && (
        <div className="workout-form-add-exercise">
          <h4>Ajouter un exercice</h4>
          <div className="workout-exercise-picker">
            {exercises.map((ex) => (
              <button
                key={ex.id}
                className="workout-pick-btn"
                onClick={() => addExerciseToList(exList, setExList, ex.id)}
              >
                + {ex.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );

  // ── Vue Player ──────────────────────────────────────────────────
  if (playingWorkout) {
    const totalExercises = playingWorkout.exercises.length;

    // Terminé
    if (playerPhase === "done") {
      return (
        <div className="workout-page">
          <div className="player-done">
            <h2 className="player-done-title">Terminé !</h2>
            <p className="player-done-time">Temps total : {formatDuration(totalElapsed)}</p>
            <button className="btn-player-start" onClick={stopPlayer}>
              Retour
            </button>
          </div>
        </div>
      );
    }

    // Phase exercice
    const currentEx = playingWorkout.exercises[playerStep];
    const exInfo = exercises.find((e) => e.id === currentEx.exercise_id);
    const hasDuration = currentEx.duration != null && currentEx.duration > 0;

    return (
      <div className="workout-page">
        <div className="player-exercise">
          <div className="player-progress">
            {playerStep + 1} / {totalExercises}
          </div>
          <h2 className="player-exercise-title">{exInfo?.title ?? "Exercice"}</h2>
          <div className="player-exercise-details">
            {currentEx.reps != null && (
              <span className="player-detail-badge">{currentEx.reps} reps</span>
            )}
            {hasDuration && (
              <span className="player-detail-badge">{formatDuration(currentEx.duration!)}</span>
            )}
          </div>
          {(currentEx.description || exInfo?.description) && (
            <p className="player-exercise-desc">
              {currentEx.description || exInfo?.description}
            </p>
          )}

          {/* Chrono exercice (countdown) pour les exercices avec durée */}
          {hasDuration && (
            <div className="player-ex-timer-zone">
              {exTimer === null ? (
                <button className="btn-player-timer-start" onClick={() => startExTimer(currentEx.duration!)}>
                  Lancer le chrono
                </button>
              ) : exTimer === 0 ? (
                <span className="player-ex-timer-done">Temps écoulé !</span>
              ) : (
                <div className="player-timer-row">
                  <span className="player-timer">{formatDuration(exTimer)}</span>
                  <button className="btn-player-pause" onClick={toggleExPause}>
                    {exPaused ? "▶" : "⏸"}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="player-timer-row">
            <span className="player-total">Total : {formatDuration(totalElapsed)}</span>
            <button className="btn-player-pause-small" onClick={toggleTotalPause}>
              {totalPaused ? "▶" : "⏸"}
            </button>
          </div>
          <div className="player-actions">
            <button className="btn-player-stop" onClick={stopPlayer}>
              Arrêter
            </button>
            <button className="btn-player-next" onClick={playerNext}>
              {playerStep < totalExercises - 1 ? "Suivant →" : "Terminer"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Vue détail séance ───────────────────────────────────────────
  if (selectedId) {
    const workout = workouts.find((w) => w.id === selectedId);
    if (!workout) {
      setSelectedId(null);
      return null;
    }

    const list = sessions[selectedId] || [];
    const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));

    return (
      <div className="workout-page">
        <button className="btn-back" onClick={() => { setSelectedId(null); setEditingDetail(false); }}>
          ← Retour
        </button>

        {editingDetail ? (
          <>
            <div className="routine-form">
              <input
                type="text"
                className="routine-input"
                placeholder="Nom de la séance"
                value={editDetailName}
                onChange={(e) => setEditDetailName(e.target.value)}
              />
              <textarea
                className="routine-input"
                placeholder="Description (optionnel)"
                rows={2}
                value={editDetailDescription}
                onChange={(e) => setEditDetailDescription(e.target.value)}
              />
              {renderExerciseFields(editDetailExercises, setEditDetailExercises, editDetailDurationInputs, setEditDetailDurationInputs)}
              <div className="routine-form-row">
                <button
                  className="btn-confirm-routine"
                  onClick={handleSaveDetail}
                  disabled={!editDetailName.trim()}
                >
                  Enregistrer
                </button>
                <button
                  className="btn-add-routine"
                  onClick={() => setEditingDetail(false)}
                >
                  Annuler
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="workout-detail-header">
              <h2 className="page-title">{workout.name}</h2>
              <div className="workout-detail-actions">
                {workout.exercises.length > 0 && (
                  <button className="btn-player-start-small" onClick={() => startPlayer(workout)}>
                    ▶ Lancer
                  </button>
                )}
                <button className="btn-add-routine" onClick={() => startEditDetail(workout)}>
                  Modifier
                </button>
              </div>
            </div>
            {workout.description && (
              <div className="workout-description-card">
                <p className="workout-description">{workout.description}</p>
              </div>
            )}

            {workout.exercises.length > 0 && (
              <div className="workout-description-card">
                <h3 className="workout-description-label">Exercices</h3>
                <div className="workout-exercise-list">
                  {workout.exercises.map((ex, i) => (
                    <div key={i} className="workout-exercise-item">
                      <span className="workout-exercise-title">
                        {getExerciseTitle(ex.exercise_id)}
                      </span>
                      <span className="workout-exercise-detail">
                        {ex.reps != null && `${ex.reps} reps`}
                        {ex.reps != null && ex.duration != null && " · "}
                        {ex.duration != null && formatDuration(ex.duration)}
                      </span>
                      {ex.description && (
                        <span className="workout-exercise-desc">{ex.description}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Formulaire nouvelle session */}
        <div className="workout-session-form">
          <h3>Nouveau résultat</h3>
          <div className="routine-form-row">
            <input
              type="text"
              className="routine-input"
              placeholder="Score / résultat"
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
          {sorted.map((s) => {
            return (
              <div key={s.id} className="workout-session-card">
                <div className="workout-session-main">
                  <span className="workout-session-value">{s.result}</span>
                  <span className="workout-session-date">{formatDate(s.date)}</span>
                </div>
                {s.notes && <span className="workout-session-notes">{s.notes}</span>}
                <button
                  className="btn-delete-routine"
                  onClick={() => deleteSession(s.id)}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Vue principale avec onglets ─────────────────────────────────
  return (
    <div className="workout-page">
      <h2 className="page-title">Sport</h2>

      {/* Onglets */}
      <div className="workout-tabs">
        <button
          className={`workout-tab ${tab === "seances" ? "active" : ""}`}
          onClick={() => setTab("seances")}
        >
          Séances
        </button>
        <button
          className={`workout-tab ${tab === "exercises" ? "active" : ""}`}
          onClick={() => setTab("exercises")}
        >
          Exercices
        </button>
      </div>

      {/* ── Onglet Exercices ─────────────────────────────────────── */}
      {tab === "exercises" && (
        <>
          <div className="routines-header">
            <h3>Exercices ({exercises.length})</h3>
            <button
              className="btn-add-routine"
              onClick={() => { showExerciseForm ? resetExerciseForm() : setShowExerciseForm(true); }}
              disabled={!connected}
            >
              {showExerciseForm ? "Annuler" : "+ Ajouter"}
            </button>
          </div>

          {showExerciseForm && (
            <div className="routine-form">
              <input
                type="text"
                className="routine-input"
                placeholder="Titre (ex: Pompes)"
                value={exTitle}
                onChange={(e) => setExTitle(e.target.value)}
              />
              <textarea
                className="routine-input"
                placeholder="Description (optionnel)"
                rows={3}
                value={exDescription}
                onChange={(e) => setExDescription(e.target.value)}
              />
              <button
                className="btn-confirm-routine"
                onClick={handleSubmitExercise}
                disabled={!exTitle.trim()}
              >
                {editingExerciseId ? "Enregistrer" : "Créer"}
              </button>
            </div>
          )}

          <div className="workouts-list">
            {exercises.length === 0 && !showExerciseForm && (
              <p className="log-empty">Aucun exercice</p>
            )}
            {exercises.map((ex) => (
              <div key={ex.id} className="workout-card" onClick={() => startEditExercise(ex)}>
                <div className="workout-card-info">
                  <span className="routine-name">{ex.title}</span>
                  {ex.description && (
                    <span className="workout-card-last">{ex.description}</span>
                  )}
                </div>
                <button
                  className="btn-delete-routine"
                  onClick={(e) => { e.stopPropagation(); setExerciseToDelete(ex); }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Onglet Séances ───────────────────────────────────────── */}
      {tab === "seances" && (
        <>
          <div className="routines-header">
            <h3>Séances ({workouts.length})</h3>
            <button
              className="btn-add-routine"
              onClick={() => { showWorkoutForm ? resetWorkoutForm() : setShowWorkoutForm(true); }}
              disabled={!connected}
            >
              {showWorkoutForm ? "Annuler" : "+ Ajouter"}
            </button>
          </div>

          {showWorkoutForm && (
            <div className="routine-form">
              <input
                type="text"
                className="routine-input"
                placeholder="Nom de la séance"
                value={wName}
                onChange={(e) => setWName(e.target.value)}
              />
              <textarea
                className="routine-input"
                placeholder="Description (optionnel)"
                rows={2}
                value={wDescription}
                onChange={(e) => setWDescription(e.target.value)}
              />

              {renderExerciseFields(wExercises, setWExercises, durationInputs, setDurationInputs)}

              <button
                className="btn-confirm-routine"
                onClick={handleSubmitWorkout}
                disabled={!wName.trim()}
              >
                {editingWorkoutId ? "Enregistrer" : "Créer la séance"}
              </button>
            </div>
          )}

          <div className="workouts-list">
            {workouts.length === 0 && !showWorkoutForm && (
              <p className="log-empty">Aucune séance</p>
            )}
            {workouts.map((w) => {
              const list = sessions[w.id] || [];
              const last = list.length > 0 ? list[list.length - 1] : null;
              return (
                <div
                  key={w.id}
                  className="workout-card"
                  onClick={() => setSelectedId(w.id)}
                >
                  <div className="workout-card-info">
                    <span className="routine-name">{w.name}</span>
                    <span className="workout-card-exercises">
                      {w.exercises.length} exercice{w.exercises.length !== 1 ? "s" : ""}
                    </span>
                    {last && (
                      <span className="workout-card-last">
                        Dernier : {last.result}
                      </span>
                    )}
                  </div>
                  <div className="workout-card-actions">
                    {w.exercises.length > 0 && (
                      <button
                        className="btn-play-routine"
                        onClick={(e) => { e.stopPropagation(); startPlayer(w); }}
                      >
                        ▶
                      </button>
                    )}
                    <button
                      className="btn-edit-routine"
                      onClick={(e) => { e.stopPropagation(); startEditWorkout(w); }}
                    >
                      ✎
                    </button>
                    <button
                      className="btn-delete-routine"
                      onClick={(e) => { e.stopPropagation(); setWorkoutToDelete(w); }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Modals de confirmation */}
      <ConfirmModal
        open={exerciseToDelete !== null}
        title="Supprimer l'exercice"
        message={
          exerciseToDelete
            ? `Supprimer "${exerciseToDelete.title}" ? Il sera retiré de toutes les séances.`
            : ""
        }
        onConfirm={confirmDeleteExercise}
        onCancel={() => setExerciseToDelete(null)}
      />
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
