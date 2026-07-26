/**
 * Réglages de la voix de l'assistant (module TTS Piper du backend).
 *
 * Utilisé par le Dashboard : la voix sert à la météo et aux annonces,
 * déclenchées depuis cette page.
 */

import { useState, useEffect, useRef } from "react";

interface WSMessage {
  type: string;
  payload: Record<string, unknown>;
}

interface Props {
  connected: boolean;
  lastMessage: WSMessage | null;
  onSend: (msg: WSMessage) => void;
}

interface Voice {
  id: string;
  label: string;
  gender: string;
  quality: string;
  size_mb: number;
  speakers: Record<string, string>;
  installed: boolean;
}

interface TtsSettings {
  engine: string;
  voice: string;
  speaker: number;
  rate: number;
  volume: number;
  active_engine: string;
  player: string;
}

export function VoiceSettings({ connected, lastMessage, onSend }: Props) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [tts, setTts] = useState<TtsSettings | null>(null);
  // Voix en cours de téléchargement / d'écoute (le premier chargement
  // d'un modèle prend quelques secondes).
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const lastProcessed = useRef<WSMessage | null>(null);
  const rateTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const volumeTimer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (!connected) return;
    onSend({ type: "tts.settings", payload: {} });
    onSend({ type: "tts.voices", payload: {} });
  }, [connected]);

  useEffect(() => {
    if (!lastMessage || lastMessage === lastProcessed.current) return;
    if (!lastMessage.type.startsWith("tts.")) return;
    lastProcessed.current = lastMessage;

    switch (lastMessage.type) {
      case "tts.voices":
        setVoices(lastMessage.payload.voices as unknown as Voice[]);
        break;
      case "tts.settings":
        setTts(lastMessage.payload as unknown as TtsSettings);
        setBusy(null);
        setError("");
        // Une voix vient peut-être d'être téléchargée : rafraîchir les badges.
        onSend({ type: "tts.voices", payload: {} });
        break;
      case "tts.done":
        setBusy(null);
        break;
      case "tts.error":
        setError((lastMessage.payload.message as string) || "Erreur de synthèse");
        setBusy(null);
        break;
    }
  }, [lastMessage, onSend]);

  const selectVoice = (voiceId: string, speaker?: number) => {
    setError("");
    setBusy(voiceId);
    onSend({ type: "tts.set_voice", payload: speaker == null ? { voice_id: voiceId } : { voice_id: voiceId, speaker } });
  };

  const previewVoice = (voiceId: string, speaker?: number) => {
    setError("");
    setBusy(voiceId);
    onSend({ type: "tts.preview", payload: speaker == null ? { voice_id: voiceId } : { voice_id: voiceId, speaker } });
  };

  // Les curseurs envoient après une courte pause pour ne pas spammer le backend.
  const changeRate = (rate: number) => {
    setTts((prev) => (prev ? { ...prev, rate } : prev));
    if (rateTimer.current) clearTimeout(rateTimer.current);
    rateTimer.current = setTimeout(() => onSend({ type: "tts.set_rate", payload: { rate } }), 400);
  };

  const changeVolume = (volume: number) => {
    setTts((prev) => (prev ? { ...prev, volume } : prev));
    if (volumeTimer.current) clearTimeout(volumeTimer.current);
    volumeTimer.current = setTimeout(() => onSend({ type: "tts.set_volume", payload: { volume } }), 400);
  };

  return (
    <>
      <div className="voice-test-row">
        <p className="config-hint">
          Synthèse neuronale locale (Piper), sans internet. La lecture sort sur
          l'enceinte de l'hologramme, pas sur ce téléphone.
        </p>
        <button
          className="btn-upload"
          onClick={() => { setError(""); onSend({ type: "tts.speak", payload: { text: "Bonjour, voici ma voix. Il fait 21 degrés." } }); }}
          disabled={!connected}
        >
          Tester
        </button>
      </div>

      {tts && (
        <p className="config-hint">
          Moteur : <strong>{tts.active_engine === "piper" ? "Piper (neuronal)" : "système (repli)"}</strong>
          {" · "}sortie audio : {tts.player}
        </p>
      )}
      {tts?.active_engine === "system" && (
        <p className="config-error">
          Piper est indisponible : la voix par défaut du système est utilisée.
          Vérifier l'installation de <code>piper-tts</code> sur le serveur.
        </p>
      )}
      {error && <p className="config-error">{error}</p>}

      <div className="voice-list">
        {voices.length === 0 && <p className="log-empty">Voix indisponibles</p>}
        {voices.map((v) => {
          const active = tts?.voice === v.id;
          const speakerIds = Object.keys(v.speakers || {});
          return (
            <div key={v.id} className={`voice-card ${active ? "active" : ""}`}>
              <button className="voice-pick" onClick={() => selectVoice(v.id)} disabled={!connected}>
                <span className="voice-label">{v.label}</span>
                <span className="voice-meta">
                  {v.id} · {v.quality}
                  {v.installed ? " · installée" : ` · ~${v.size_mb} Mo à télécharger`}
                  {busy === v.id && " · préparation…"}
                </span>
              </button>
              <button
                className="btn-voice-preview"
                onClick={() => previewVoice(v.id)}
                disabled={!connected || busy === v.id}
                title="Écouter cette voix sur l'hologramme"
              >
                ▶
              </button>
              {active && speakerIds.length > 0 && (
                <div className="voice-speakers">
                  {speakerIds.map((id) => (
                    <button
                      key={id}
                      className={`category-btn ${Number(id) === tts?.speaker ? "active" : ""}`}
                      onClick={() => selectVoice(v.id, Number(id))}
                      disabled={!connected}
                    >
                      {v.speakers[id]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {tts && (
        <div className="voice-sliders">
          <div className="planes-field">
            <label>Débit : {tts.rate} mots/minute</label>
            <input
              type="range"
              min={120}
              max={280}
              step={10}
              value={tts.rate}
              onChange={(e) => changeRate(Number(e.target.value))}
              disabled={!connected}
            />
          </div>
          <div className="planes-field">
            <label>Volume : {Math.round(tts.volume * 100)} %</label>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(tts.volume * 100)}
              onChange={(e) => changeVolume(Number(e.target.value) / 100)}
              disabled={!connected}
            />
          </div>
        </div>
      )}
    </>
  );
}
