/**
 * Page Avions : affiche les avions autour d'un point d'observation,
 * avec un radar orienté selon la direction du regard et le champ de vision.
 *
 * Les avions dans le champ de vision sont mis en avant ; les autres
 * (dans le rayon mais hors champ) restent visibles en atténué.
 */

import { useState, useEffect, useRef, useCallback } from "react";

interface WSMessage {
  type: string;
  payload: Record<string, unknown>;
}

interface Place {
  city: string | null;
  country_iso: string | null;
  country: string | null;
}

interface Plane {
  hex: string;
  callsign: string | null;
  registration: string | null;
  type: string | null;
  distance_km: number;
  bearing: number;
  rel_bearing: number;
  track: number | null;
  speed_kmh: number | null;
  altitude_m: number | null;
  visible: boolean;
  origin: Place | null;
  destination: Place | null;
  airline: string | null;
  manufacturer: string | null;
  model: string | null;
}

interface PlanesConfig {
  latitude: number;
  longitude: number;
  azimuth: number;
  fov: number;
  radius_km: number;
  follows_city: boolean;
}

interface Props {
  connected: boolean;
  lastMessage: WSMessage | null;
  onSend: (msg: WSMessage) => void;
}

const REFRESH_INTERVAL_MS = 10_000;

const COMPASS_POINTS: { label: string; deg: number }[] = [
  { label: "N", deg: 0 },
  { label: "NE", deg: 45 },
  { label: "E", deg: 90 },
  { label: "SE", deg: 135 },
  { label: "S", deg: 180 },
  { label: "SO", deg: 225 },
  { label: "O", deg: 270 },
  { label: "NO", deg: 315 },
];

/** Nom du point cardinal le plus proche d'un cap donné. */
function compassName(deg: number): string {
  const idx = Math.round((((deg % 360) + 360) % 360) / 45) % 8;
  return COMPASS_POINTS[idx].label;
}

/** Noms de pays en français à partir du code ISO. */
const regionNames = new Intl.DisplayNames(["fr"], { type: "region" });

/** "Ville, Pays" (pays traduit en français si possible). */
function formatPlace(place: Place | null): string | null {
  if (!place) return null;
  let country = place.country;
  if (place.country_iso) {
    try {
      country = regionNames.of(place.country_iso) || country;
    } catch {}
  }
  return [place.city, country].filter(Boolean).join(", ") || null;
}

/** "Airbus A320 214" ; à défaut de registre, le code type ADS-B ("A320"). */
function formatModel(p: Plane): string | null {
  return [p.manufacturer, p.model].filter(Boolean).join(" ") || p.type;
}

/** Direction relative lisible ("droit devant", "34° à gauche"…). */
function formatDirection(rel: number): string {
  const a = Math.abs(Math.round(rel));
  if (a <= 5) return "droit devant";
  if (a > 150) return "derrière";
  return rel < 0 ? `${a}° à gauche` : `${a}° à droite`;
}

/** Point sur un cercle : angle en degrés, 0 = haut, sens horaire. */
function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

// ── Radar SVG ──────────────────────────────────────────────────────

const SIZE = 340;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 138;

function Radar({ planes, config }: { planes: Plane[]; config: PlanesConfig }) {
  const fullCircle = config.fov >= 360;
  const half = config.fov / 2;

  // Secteur du champ de vision (0 = direction du regard, vers le haut)
  const p1 = polar(CX, CY, R, -half);
  const p2 = polar(CX, CY, R, half);
  const sectorPath = `M ${CX} ${CY} L ${p1.x} ${p1.y} A ${R} ${R} 0 ${config.fov > 180 ? 1 : 0} 1 ${p2.x} ${p2.y} Z`;

  const nearestVisible = planes.find((p) => p.visible);

  // Position de chaque avion, dans l'ordre du plus proche au plus loin
  const positioned = planes.map((p) => ({
    p,
    pos: polar(CX, CY, (p.distance_km / config.radius_km) * R, p.rel_bearing),
  }));

  // Labels : priorité aux plus proches, on masque ceux qui se chevaucheraient
  const labeled = new Set<string>();
  const anchors: { x: number; y: number }[] = [];
  for (const { p, pos } of positioned) {
    if (anchors.every((a) => Math.hypot(a.x - pos.x, a.y - pos.y) >= 28)) {
      labeled.add(p.hex);
      anchors.push(pos);
    }
  }

  return (
    <svg
      className="planes-radar"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label="Radar des avions"
    >
      {/* Disque de fond + anneaux de distance */}
      <circle cx={CX} cy={CY} r={R} className="radar-disc" />
      {[1 / 3, 2 / 3, 1].map((f) => (
        <circle key={f} cx={CX} cy={CY} r={R * f} className="radar-ring" />
      ))}

      {/* Secteur du champ de vision */}
      {fullCircle ? (
        <circle cx={CX} cy={CY} r={R} className="radar-fov" />
      ) : (
        <path d={sectorPath} className="radar-fov" />
      )}

      {/* Points cardinaux (le radar est orienté regard vers le haut) */}
      {COMPASS_POINTS.filter((c) => c.deg % 90 === 0).map((c) => {
        const pos = polar(CX, CY, R + 14, c.deg - config.azimuth);
        return (
          <text key={c.label} x={pos.x} y={pos.y} className={`radar-cardinal ${c.label === "N" ? "north" : ""}`}>
            {c.label}
          </text>
        );
      })}

      {/* Étiquettes de distance sur l'axe du regard */}
      {[1 / 3, 2 / 3, 1].map((f) => (
        <text key={f} x={CX + 4} y={CY - R * f + 12} className="radar-ring-label">
          {Math.round(config.radius_km * f)} km
        </text>
      ))}

      {/* Observateur au centre (sous les avions) */}
      <circle cx={CX} cy={CY} r="4" className="radar-observer" />

      {/* Avions — du plus loin au plus proche pour que les proches restent visibles */}
      {[...positioned].reverse().map(({ p, pos }) => {
        const rotation = p.track != null ? p.track - config.azimuth : 0;
        const isNearest = p === nearestVisible;
        return (
          <g key={p.hex} transform={`translate(${pos.x} ${pos.y})`} className={p.visible ? "radar-plane" : "radar-plane out"}>
            {isNearest && <circle r="11" className="radar-plane-pulse" />}
            {p.track != null ? (
              <path d="M 0 -7 L 4.5 5 L 0 2.4 L -4.5 5 Z" transform={`rotate(${rotation})`} />
            ) : (
              <circle r="4" />
            )}
            {labeled.has(p.hex) && (
              <text y="16" className="radar-plane-label">
                {p.callsign || p.registration || p.hex}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ── Page ───────────────────────────────────────────────────────────

export function PlanesPage({ connected, lastMessage, onSend }: Props) {
  const [planes, setPlanes] = useState<Plane[]>([]);
  const [config, setConfig] = useState<PlanesConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  // Initialisé avec le message courant pour ignorer un planes.* périmé
  // resté dans App lors d'un remontage de la page
  const lastProcessed = useRef<WSMessage | null>(lastMessage);
  // Armé par saveConfig : la prochaine réponse planes.config déclenche un refresh
  const configSaved = useRef(false);

  // Formulaire de configuration
  const [formAzimuth, setFormAzimuth] = useState(180);
  const [formFov, setFormFov] = useState(120);
  const [formRadius, setFormRadius] = useState(50);
  const [formLat, setFormLat] = useState("");
  const [formLon, setFormLon] = useState("");
  const [coordsDirty, setCoordsDirty] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    onSend({ type: "planes.get", payload: {} });
  }, [onSend]);

  // Config + première liste à la connexion
  useEffect(() => {
    if (connected) {
      onSend({ type: "planes.config.get", payload: {} });
      refresh();
    }
  }, [connected]);

  // Rafraîchissement automatique
  useEffect(() => {
    if (!connected || !autoRefresh) return;
    const timer = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [connected, autoRefresh, refresh]);

  // Traiter les messages planes.*
  useEffect(() => {
    if (!lastMessage || lastMessage === lastProcessed.current) return;
    if (!lastMessage.type.startsWith("planes.")) return;
    lastProcessed.current = lastMessage;

    switch (lastMessage.type) {
      case "planes.list": {
        setPlanes(lastMessage.payload.planes as unknown as Plane[]);
        setConfig(lastMessage.payload.config as unknown as PlanesConfig);
        setLastUpdate(new Date());
        setLoading(false);
        setError("");
        break;
      }
      case "planes.config": {
        setConfig(lastMessage.payload as unknown as PlanesConfig);
        // Après une sauvegarde : les avions affichés ont été calculés avec
        // l'ancienne config, on vide en attendant la liste recalculée
        if (configSaved.current) {
          configSaved.current = false;
          setPlanes([]);
          refresh();
        }
        break;
      }
      case "planes.error":
        setError((lastMessage.payload.message as string) || "Erreur inconnue");
        setLoading(false);
        break;
    }
  }, [lastMessage, refresh]);

  // Pré-remplir le formulaire à l'ouverture du panneau
  const openConfig = () => {
    if (!config) return; // pas de config reçue → rien à éditer
    if (!showConfig) {
      setFormAzimuth(Math.round(config.azimuth));
      setFormFov(Math.round(config.fov));
      setFormRadius(Math.round(config.radius_km));
      setFormLat(config.latitude.toFixed(5));
      setFormLon(config.longitude.toFixed(5));
      setCoordsDirty(false);
    }
    setShowConfig(!showConfig);
  };

  const saveConfig = (useCity: boolean) => {
    const payload: Record<string, unknown> = {
      azimuth: formAzimuth,
      fov: formFov,
      radius_km: formRadius,
    };
    // Coordonnées non touchées → on préserve le suivi de la ville météo
    if (useCity || (config?.follows_city && !coordsDirty)) {
      payload.use_city = true;
    } else {
      const lat = parseFloat(formLat);
      const lon = parseFloat(formLon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        setError("Coordonnées invalides");
        return;
      }
      payload.latitude = lat;
      payload.longitude = lon;
    }
    configSaved.current = true;
    onSend({ type: "planes.config.set", payload });
    setShowConfig(false);
  };

  // En vue : triés par altitude (les plus bas d'abord, altitude inconnue à la fin)
  const visiblePlanes = planes
    .filter((p) => p.visible)
    .sort((a, b) => (a.altitude_m ?? Infinity) - (b.altitude_m ?? Infinity));
  const hiddenPlanes = planes.filter((p) => !p.visible);

  return (
    <div className="planes-page">
      <div className="planes-header">
        <h2 className="page-title">Avions</h2>
        <div className="planes-actions">
          <button
            className={`planes-btn ${autoRefresh ? "active" : ""}`}
            onClick={() => setAutoRefresh(!autoRefresh)}
            title="Rafraîchissement automatique (10 s)"
          >
            {autoRefresh ? "Auto ✓" : "Auto"}
          </button>
          <button className="planes-btn" onClick={refresh} disabled={!connected || loading}>
            {loading ? "…" : "⟳"}
          </button>
          <button className={`planes-btn ${showConfig ? "active" : ""}`} onClick={openConfig} disabled={!config}>
            ⚙
          </button>
        </div>
      </div>

      {config && (
        <p className="planes-status">
          Regard vers {compassName(config.azimuth)} ({Math.round(config.azimuth)}°) · champ{" "}
          {Math.round(config.fov)}° · rayon {Math.round(config.radius_km)} km
          {config.follows_city && " · position : ville météo"}
          {lastUpdate && ` · MAJ ${lastUpdate.toLocaleTimeString("fr-FR")}`}
        </p>
      )}

      {error && <p className="config-error">{error}</p>}

      {/* Panneau de configuration */}
      {showConfig && (
        <div className="config-section planes-config">
          <div className="config-section-header">
            <h3>Point d'observation</h3>
          </div>

          <div className="planes-field">
            <span className="config-label">Direction du regard : {formAzimuth}° ({compassName(formAzimuth)})</span>
            <input
              type="range"
              min="0"
              max="355"
              step="5"
              value={formAzimuth}
              onChange={(e) => setFormAzimuth(Number(e.target.value))}
            />
            <div className="planes-compass-btns">
              {COMPASS_POINTS.map((c) => (
                <button
                  key={c.label}
                  className={`category-btn ${formAzimuth === c.deg ? "active" : ""}`}
                  onClick={() => setFormAzimuth(c.deg)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="planes-field">
            <span className="config-label">Champ de vision : {formFov}°</span>
            <input
              type="range"
              min="20"
              max="360"
              step="10"
              value={formFov}
              onChange={(e) => setFormFov(Number(e.target.value))}
            />
          </div>

          <div className="planes-field">
            <span className="config-label">Rayon : {formRadius} km</span>
            <input
              type="range"
              min="10"
              max="200"
              step="10"
              value={formRadius}
              onChange={(e) => setFormRadius(Number(e.target.value))}
            />
          </div>

          <div className="planes-field">
            <span className="config-label">Position (latitude, longitude)</span>
            <div className="planes-coords">
              <input
                type="text"
                inputMode="decimal"
                className="routine-input"
                value={formLat}
                onChange={(e) => { setFormLat(e.target.value); setCoordsDirty(true); }}
                placeholder="Latitude"
              />
              <input
                type="text"
                inputMode="decimal"
                className="routine-input"
                value={formLon}
                onChange={(e) => { setFormLon(e.target.value); setCoordsDirty(true); }}
                placeholder="Longitude"
              />
            </div>
          </div>

          <div className="planes-config-actions">
            <button className="btn-add-routine" onClick={() => saveConfig(true)} disabled={!connected}>
              📍 Suivre la ville météo
            </button>
            <button className="btn-confirm-routine" onClick={() => saveConfig(false)} disabled={!connected}>
              Enregistrer
            </button>
          </div>
        </div>
      )}

      {/* Radar */}
      {config && <Radar planes={planes} config={config} />}

      {/* Liste des avions dans le champ de vision */}
      <div className="planes-list">
        <div className="planes-list-header">
          <span className="config-label">
            En vue ({visiblePlanes.length}){visiblePlanes.length > 1 && " — triés par altitude"}
          </span>
        </div>

        {visiblePlanes.length === 0 && (
          <p className="log-empty">
            {loading ? "Recherche…" : "Aucun avion dans le champ de vision"}
          </p>
        )}

        {visiblePlanes.map((p) => {
          const from = formatPlace(p.origin);
          const to = formatPlace(p.destination);
          return (
          <div key={p.hex} className="planes-item">
            <div className="planes-item-main">
              <div className="planes-item-id">
                <span className="planes-callsign">{p.callsign || p.registration || p.hex}</span>
                {p.airline && <span className="planes-airline">{p.airline}</span>}
                <span className="planes-detail">
                  {[formatModel(p), p.registration].filter(Boolean).join(" · ")}
                </span>
              </div>
              <div className="planes-item-nav">
                <span className={`planes-distance ${p.distance_km <= 10 ? "close" : ""}`}>
                  {p.distance_km.toFixed(1)} km
                </span>
                <span className="planes-detail">
                  {p.altitude_m != null && (
                    <>
                      <span className={p.altitude_m < 5000 ? "planes-altitude-low" : ""}>
                        {p.altitude_m.toLocaleString("fr-FR")} m
                      </span>
                      {" · "}
                    </>
                  )}
                  {formatDirection(p.rel_bearing)}
                  {p.speed_kmh != null && ` · ${p.speed_kmh} km/h`}
                </span>
              </div>
            </div>
            {(from || to) && (
              <div className="planes-route">
                {from || "Départ inconnu"} → {to || "Destination inconnue"}
              </div>
            )}
          </div>
          );
        })}
      </div>

      {/* Avions dans le rayon mais hors du champ de vision */}
      {hiddenPlanes.length > 0 && (
        <div className="planes-list planes-list-hidden">
          <button className="planes-list-toggle" onClick={() => setShowHidden(!showHidden)}>
            Hors champ ({hiddenPlanes.length}) {showHidden ? "▾" : "▸"}
          </button>
          {showHidden &&
            hiddenPlanes.map((p) => {
              const from = formatPlace(p.origin);
              const to = formatPlace(p.destination);
              return (
              <div key={p.hex} className="planes-item planes-item-out">
                <div className="planes-item-main">
                  <div className="planes-item-id">
                    <span className="planes-callsign">{p.callsign || p.registration || p.hex}</span>
                    {p.airline && <span className="planes-airline">{p.airline}</span>}
                    <span className="planes-detail">
                      {[formatModel(p), p.registration].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  <div className="planes-item-nav">
                    <span className="planes-distance">{p.distance_km.toFixed(1)} km</span>
                    <span className="planes-detail">
                      cap {p.bearing}° ({compassName(p.bearing)})
                    </span>
                  </div>
                </div>
                {(from || to) && (
                  <div className="planes-route">
                    {from || "Départ inconnu"} → {to || "Destination inconnue"}
                  </div>
                )}
              </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
