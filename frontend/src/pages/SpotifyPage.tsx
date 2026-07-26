/**
 * Page Spotify : identifiants de l'application, recherche de playlists,
 * mise en file d'attente et création de playlists.
 *
 * Toute la logique vit dans le backend (module `spotify`) : cette page ne fait
 * qu'envoyer des messages WebSocket et afficher les réponses.
 */

import { useState, useEffect, useRef } from "react";
import { Fold } from "../components/Fold";

interface WSMessage {
  type: string;
  payload: Record<string, unknown>;
}

interface Props {
  connected: boolean;
  lastMessage: WSMessage | null;
  onSend: (msg: WSMessage) => void;
}

interface Status {
  configured: boolean;
  connected: boolean;
  client_id: string;
  redirect_uri: string;
  has_secret: boolean;
  device_id: string;
  account?: { id: string; name: string; premium: boolean } | null;
  warning?: string;
}

interface Playlist {
  id: string;
  uri: string;
  name: string;
  owner: string;
  tracks: number;
  image: string;
  public: boolean;
}

interface Track {
  id: string;
  uri: string;
  name: string;
  artists: string;
  album: string;
  duration_ms: number;
  image: string;
}

interface Device {
  id: string;
  name: string;
  type: string;
  active: boolean;
  volume: number | null;
}

interface NowPlaying {
  playing: boolean;
  track?: Track | null;
  device?: { id: string; name: string };
}

const formatDuration = (ms: number) => {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

export function SpotifyPage({ connected, lastMessage, onSend }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [authUrl, setAuthUrl] = useState("");

  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"playlist" | "track">("playlist");
  const [results, setResults] = useState<(Playlist | Track)[]>([]);
  const [searching, setSearching] = useState(false);

  const [openPlaylist, setOpenPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loadingTracks, setLoadingTracks] = useState(false);

  const [myPlaylists, setMyPlaylists] = useState<Playlist[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPublic, setNewPublic] = useState(false);

  const [devices, setDevices] = useState<Device[]>([]);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);

  // Identifiants de l'application (formulaire)
  const [credsId, setCredsId] = useState("");
  const [credsSecret, setCredsSecret] = useState("");
  const [credsRedirect, setCredsRedirect] = useState("");
  const [credsSaved, setCredsSaved] = useState(false);

  const lastProcessed = useRef<WSMessage | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const flash = (message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 4000);
  };

  // Charger l'état à la connexion
  useEffect(() => {
    if (!connected) return;
    onSend({ type: "spotify.status", payload: {} });
  }, [connected]);

  // Une fois le compte relié : appareils, lecture en cours, playlists
  useEffect(() => {
    if (!status?.connected) return;
    onSend({ type: "spotify.devices", payload: {} });
    onSend({ type: "spotify.now_playing", payload: {} });
    onSend({ type: "spotify.playlists", payload: {} });
  }, [status?.connected]);

  useEffect(() => {
    if (!lastMessage || lastMessage === lastProcessed.current) return;
    if (!lastMessage.type.startsWith("spotify.")) return;
    lastProcessed.current = lastMessage;

    const payload = lastMessage.payload;

    switch (lastMessage.type) {
      case "spotify.status": {
        const s = payload as unknown as Status;
        setStatus(s);
        setCredsId(s.client_id);
        setCredsRedirect(s.redirect_uri || `${window.location.origin}/api/spotify/callback`);
        setCredsSecret("");
        setAuthUrl("");
        setError("");
        break;
      }

      case "spotify.auth_url": {
        const url = payload.url as string;
        // Ouverture directe si le navigateur l'autorise, sinon on affiche le lien.
        if (!window.open(url, "_blank", "noopener")) setAuthUrl(url);
        break;
      }

      case "spotify.search":
        setResults(payload.items as unknown as (Playlist | Track)[]);
        setSearching(false);
        break;

      case "spotify.playlist":
        setOpenPlaylist(payload.playlist as unknown as Playlist);
        setTracks(payload.tracks as unknown as Track[]);
        setLoadingTracks(false);
        break;

      case "spotify.playlists":
        setMyPlaylists(payload.playlists as unknown as Playlist[]);
        break;

      case "spotify.playlist_created":
        setMyPlaylists((prev) => [payload as unknown as Playlist, ...prev]);
        setCreating(false);
        setNewName("");
        setNewDescription("");
        flash(`Playlist « ${payload.name} » créée`);
        break;

      case "spotify.playlist_updated":
        flash(`${payload.added} titre(s) ajouté(s) à la playlist`);
        break;

      case "spotify.queued":
        flash(
          `${payload.count} titre(s) en file d'attente` +
            (payload.truncated ? " (limité aux 50 premiers)" : "")
        );
        break;

      case "spotify.devices":
        setDevices(payload.devices as unknown as Device[]);
        break;

      case "spotify.now_playing":
        setNowPlaying(payload as unknown as NowPlaying);
        break;

      case "spotify.done":
        // Les commandes de lecture mettent un instant à se propager.
        setTimeout(() => onSend({ type: "spotify.now_playing", payload: {} }), 600);
        break;

      case "spotify.error":
        setError((payload.message as string) || "Erreur Spotify");
        setSearching(false);
        setLoadingTracks(false);
        break;
    }
  }, [lastMessage, onSend]);

  const search = () => {
    if (!query.trim()) return;
    setError("");
    setSearching(true);
    setResults([]);
    onSend({ type: "spotify.search", payload: { query: query.trim(), kind } });
  };

  const openPlaylistDetail = (playlist: Playlist) => {
    setError("");
    setLoadingTracks(true);
    setOpenPlaylist(playlist);
    setTracks([]);
    onSend({ type: "spotify.playlist", payload: { id: playlist.id } });
  };

  const queue = (uris: string[]) => {
    setError("");
    onSend({ type: "spotify.queue", payload: { uris } });
  };

  const copyToPlaylist = (playlistId: string) => {
    if (!playlistId || tracks.length === 0) return;
    setError("");
    onSend({ type: "spotify.playlist_add", payload: { playlist_id: playlistId, uris: tracks.map((t) => t.uri) } });
  };

  const createPlaylist = () => {
    if (!newName.trim()) return;
    setError("");
    onSend({
      type: "spotify.playlist_create",
      payload: { name: newName.trim(), description: newDescription.trim(), public: newPublic },
    });
  };

  const saveCreds = () => {
    setError("");
    onSend({
      type: "spotify.set_credentials",
      payload: {
        client_id: credsId.trim(),
        client_secret: credsSecret.trim(), // vide = inchangé côté backend
        redirect_uri: credsRedirect.trim(),
      },
    });
    setCredsSaved(true);
    setTimeout(() => setCredsSaved(false), 3000);
  };

  // ── Rendu ─────────────────────────────────────────────────────────

  const credsForm = (
    <>
      <p className="config-hint">
        Créer une application sur{" "}
        <a href="https://developer.spotify.com/dashboard" target="_blank" rel="noreferrer">
          developer.spotify.com/dashboard
        </a>
        , y déclarer l'URL de redirection ci-dessous, puis recopier les identifiants ici.
      </p>

      <div className="planes-field">
        <label>Client ID</label>
        <input
          type="text"
          className="routine-input"
          placeholder="32 caractères"
          value={credsId}
          onChange={(e) => setCredsId(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="planes-field">
        <label>Client Secret</label>
        <input
          type="password"
          className="routine-input"
          placeholder={status?.has_secret ? "•••••••• (enregistré — laisser vide pour conserver)" : "Client secret"}
          value={credsSecret}
          onChange={(e) => setCredsSecret(e.target.value)}
          autoComplete="new-password"
        />
      </div>

      <div className="planes-field">
        <label>Redirect URI (à déclarer à l'identique chez Spotify)</label>
        <input
          type="text"
          className="routine-input"
          value={credsRedirect}
          onChange={(e) => setCredsRedirect(e.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="spotify-actions">
        <button className="action-btn" onClick={saveCreds} disabled={!connected || !credsId.trim()}>
          {credsSaved ? "Enregistré ✓" : "Enregistrer"}
        </button>
        {status?.connected && (
          <button className="btn-upload" onClick={() => onSend({ type: "spotify.disconnect", payload: {} })}>
            Déconnecter le compte
          </button>
        )}
      </div>
    </>
  );

  if (status && !status.configured) {
    return (
      <div className="spotify-page">
        <h2 className="page-title">Spotify</h2>
        {error && <p className="config-error">{error}</p>}
        <div className="config-section">
          <div className="config-section-header">
            <h3>Identifiants de l'application</h3>
          </div>
          {credsForm}
        </div>
      </div>
    );
  }

  return (
    <div className="spotify-page">
      <h2 className="page-title">Spotify</h2>

      {error && <p className="config-error">{error}</p>}
      {notice && <p className="spotify-notice">{notice}</p>}

      {/* Compte */}
      {status && !status.connected && (
        <div className="config-section">
          <p className="config-hint">
            Ton compte Spotify n'est pas encore relié. L'autorisation s'ouvre
            dans un nouvel onglet, une seule fois.
          </p>
          <button
            className="action-btn"
            onClick={() => { setError(""); onSend({ type: "spotify.auth_url", payload: {} }); }}
            disabled={!connected}
          >
            Connecter mon compte Spotify
          </button>
          {authUrl && (
            <p className="config-hint">
              L'ouverture automatique a été bloquée —{" "}
              <a href={authUrl} target="_blank" rel="noreferrer">ouvrir l'autorisation Spotify</a>.
            </p>
          )}
        </div>
      )}

      {status?.connected && (
        <>
          {/* Lecture en cours + appareil */}
          <div className="config-section">
            <div className="config-section-header">
              <h3>Lecture</h3>
              <span className="config-hint">
                {status.account ? status.account.name : "compte relié"}
                {status.account && !status.account.premium && " · compte gratuit"}
              </span>
            </div>

            {status.account && !status.account.premium && (
              <p className="config-error">
                Spotify réserve le pilotage de la lecture (file d'attente, play/pause)
                aux comptes Premium.
              </p>
            )}

            <div className="spotify-now">
              {nowPlaying?.track ? (
                <>
                  {nowPlaying.track.image && <img src={nowPlaying.track.image} alt="" className="spotify-cover" />}
                  <div className="spotify-now-info">
                    <span className="spotify-track-name">{nowPlaying.track.name}</span>
                    <span className="spotify-track-meta">{nowPlaying.track.artists}</span>
                    {nowPlaying.device?.name && (
                      <span className="spotify-track-meta">sur {nowPlaying.device.name}</span>
                    )}
                  </div>
                </>
              ) : (
                <p className="log-empty">Rien en lecture</p>
              )}
            </div>

            <div className="spotify-transport">
              <button className="category-btn" onClick={() => onSend({ type: "spotify.play", payload: {} })} disabled={!connected}>Lecture</button>
              <button className="category-btn" onClick={() => onSend({ type: "spotify.pause", payload: {} })} disabled={!connected}>Pause</button>
              <button className="category-btn" onClick={() => onSend({ type: "spotify.next", payload: {} })} disabled={!connected}>Suivant</button>
              <button className="category-btn" onClick={() => { onSend({ type: "spotify.devices", payload: {} }); onSend({ type: "spotify.now_playing", payload: {} }); }} disabled={!connected}>Rafraîchir</button>
            </div>

            <div className="planes-field">
              <label>Appareil de lecture</label>
              <div className="spotify-devices">
                {devices.length === 0 && (
                  <p className="config-hint">
                    Aucun appareil visible. Lance Spotify sur une enceinte ou un
                    téléphone, puis rafraîchis.
                  </p>
                )}
                {devices.map((d) => (
                  <button
                    key={d.id}
                    className={`category-btn ${d.id === status.device_id || d.active ? "active" : ""}`}
                    onClick={() => onSend({ type: "spotify.set_device", payload: { device_id: d.id } })}
                    disabled={!connected}
                  >
                    {d.name} <span className="spotify-device-type">{d.type}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Recherche */}
          <div className="config-section">
            <div className="config-section-header">
              <h3>Rechercher</h3>
            </div>
            <div className="spotify-search">
              <input
                type="text"
                className="routine-input"
                placeholder={kind === "playlist" ? "Nom d'une playlist…" : "Titre ou artiste…"}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && search()}
              />
              <button className="action-btn" onClick={search} disabled={!connected || !query.trim()}>
                Chercher
              </button>
            </div>
            <div className="store-pick">
              <button className={`category-btn ${kind === "playlist" ? "active" : ""}`} onClick={() => setKind("playlist")}>Playlists</button>
              <button className={`category-btn ${kind === "track" ? "active" : ""}`} onClick={() => setKind("track")}>Titres</button>
            </div>

            {searching && <p className="config-hint">Recherche…</p>}

            <div className="spotify-list">
              {kind === "playlist"
                ? (results as Playlist[]).map((p) => (
                    <div key={p.id} className="spotify-card">
                      {p.image && <img src={p.image} alt="" className="spotify-cover" />}
                      <button className="spotify-card-main" onClick={() => openPlaylistDetail(p)}>
                        <span className="spotify-track-name">{p.name}</span>
                        <span className="spotify-track-meta">{p.owner} · {p.tracks} titres</span>
                      </button>
                    </div>
                  ))
                : (results as Track[]).map((t) => (
                    <div key={t.id} className="spotify-card">
                      {t.image && <img src={t.image} alt="" className="spotify-cover" />}
                      <div className="spotify-card-main">
                        <span className="spotify-track-name">{t.name}</span>
                        <span className="spotify-track-meta">{t.artists} · {formatDuration(t.duration_ms)}</span>
                      </div>
                      <button className="btn-voice-preview" title="Mettre en file d'attente" onClick={() => queue([t.uri])} disabled={!connected}>+</button>
                    </div>
                  ))}
            </div>
          </div>

          {/* Playlist ouverte */}
          {openPlaylist && (
            <div className="config-section">
              <div className="config-section-header">
                <h3>{openPlaylist.name}</h3>
                <button className="btn-upload" onClick={() => { setOpenPlaylist(null); setTracks([]); }}>Fermer</button>
              </div>
              <p className="config-hint">{openPlaylist.owner} · {tracks.length} titres chargés</p>

              <div className="spotify-actions">
                <button className="action-btn" onClick={() => queue(tracks.map((t) => t.uri))} disabled={!connected || tracks.length === 0}>
                  Tout mettre en file d'attente
                </button>
                {myPlaylists.length > 0 && (
                  <select
                    className="routine-input"
                    defaultValue=""
                    onChange={(e) => { copyToPlaylist(e.target.value); e.target.value = ""; }}
                    disabled={!connected || tracks.length === 0}
                  >
                    <option value="">Copier vers ma playlist…</option>
                    {myPlaylists.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {loadingTracks && <p className="config-hint">Chargement des titres…</p>}

              <div className="spotify-list">
                {tracks.map((t, i) => (
                  <div key={`${t.id}-${i}`} className="spotify-card">
                    <div className="spotify-card-main">
                      <span className="spotify-track-name">{t.name}</span>
                      <span className="spotify-track-meta">{t.artists} · {formatDuration(t.duration_ms)}</span>
                    </div>
                    <button className="btn-voice-preview" title="Mettre en file d'attente" onClick={() => queue([t.uri])} disabled={!connected}>+</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Mes playlists */}
          <div className="config-section">
            <div className="config-section-header">
              <h3>Mes playlists ({myPlaylists.length})</h3>
              <button className="btn-upload" onClick={() => setCreating((v) => !v)}>
                {creating ? "Annuler" : "+ Créer"}
              </button>
            </div>

            {creating && (
              <div className="spotify-create">
                <input
                  type="text"
                  className="routine-input"
                  placeholder="Nom de la playlist"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <input
                  type="text"
                  className="routine-input"
                  placeholder="Description (facultatif)"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                />
                <label className="spotify-checkbox">
                  <input type="checkbox" checked={newPublic} onChange={(e) => setNewPublic(e.target.checked)} />
                  Playlist publique
                </label>
                <button className="action-btn" onClick={createPlaylist} disabled={!connected || !newName.trim()}>
                  Créer la playlist
                </button>
              </div>
            )}

            <div className="spotify-list">
              {myPlaylists.length === 0 && <p className="log-empty">Aucune playlist</p>}
              {myPlaylists.map((p) => (
                <div key={p.id} className="spotify-card">
                  {p.image && <img src={p.image} alt="" className="spotify-cover" />}
                  <button className="spotify-card-main" onClick={() => openPlaylistDetail(p)}>
                    <span className="spotify-track-name">{p.name}</span>
                    <span className="spotify-track-meta">{p.tracks} titres · {p.public ? "publique" : "privée"}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Identifiants de l'application (modifiable après coup) */}
      {status && (
        <Fold title="Identifiants de l'application">
          {credsForm}
        </Fold>
      )}
    </div>
  );
}
