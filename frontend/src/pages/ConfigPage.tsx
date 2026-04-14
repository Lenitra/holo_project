/**
 * Page Configuration : ville météo + gestion des fichiers MP3.
 */

import { useState, useEffect, useRef } from "react";
import { getAllMenuInOrder, isHidden, setHidden, moveItem, subscribeMenuChanges, type MenuItem } from "../menuConfig";

interface MusicFile {
  name: string;
  size: number;
}

interface City {
  name: string;
  latitude: number;
  longitude: number;
}

interface GeoResult {
  name: string;
  country: string;
  admin1?: string;
  latitude: number;
  longitude: number;
}

const API_BASE = import.meta.env.DEV ? "http://localhost:3000" : "";

const STORES: Record<string, string> = {
  carrefour: "Carrefour",
  intermarche: "Intermarché",
};

export function ConfigPage() {
  // ── Ville météo ─────────────────────────────────────────────────
  const [city, setCity] = useState<City | null>(null);
  const [citySearch, setCitySearch] = useState("");
  const [cityResults, setCityResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(null);

  // ── Magasin préféré ─────────────────────────────────────────────
  const [store, setStore] = useState("carrefour");

  useEffect(() => {
    fetch(`${API_BASE}/api/settings`)
      .then((r) => r.json())
      .then((s) => {
        setCity(s.city);
        setStore(s.store || "carrefour");
      })
      .catch(() => {});
  }, []);

  // ── Menu latéral ────────────────────────────────────────────────
  const [menuItems, setMenuItems] = useState<MenuItem[]>(getAllMenuInOrder);

  useEffect(() => {
    return subscribeMenuChanges(() => setMenuItems(getAllMenuInOrder()));
  }, []);

  const handleStoreChange = async (value: string) => {
    setStore(value);
    try {
      await fetch(`${API_BASE}/api/settings/store`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store: value }),
      });
    } catch {}
  };

  const handleCitySearch = (query: string) => {
    setCitySearch(query);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (query.trim().length < 2) {
      setCityResults([]);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query.trim())}&count=5&language=fr`;
        const res = await fetch(url);
        const data = await res.json();
        setCityResults(
          (data.results || []).map((r: Record<string, unknown>) => ({
            name: r.name as string,
            country: r.country as string,
            admin1: r.admin1 as string | undefined,
            latitude: r.latitude as number,
            longitude: r.longitude as number,
          }))
        );
      } catch {
        setCityResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  const selectCity = async (result: GeoResult) => {
    const newCity = { name: result.name, latitude: result.latitude, longitude: result.longitude };
    try {
      const res = await fetch(`${API_BASE}/api/settings/city`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newCity),
      });
      if (res.ok) setCity(await res.json());
    } catch {}
    setCitySearch("");
    setCityResults([]);
  };

  // ── Musiques ────────────────────────────────────────────────────
  const [files, setFiles] = useState<MusicFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchFiles = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/music`);
      const data = await res.json();
      setFiles(data.files || []);
    } catch {
      setFiles([]);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/api/music/upload`, { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erreur upload");
      } else {
        await fetchFiles();
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDelete = async (name: string) => {
    try {
      await fetch(`${API_BASE}/api/music/${encodeURIComponent(name)}`, { method: "DELETE" });
      await fetchFiles();
    } catch {
      setError("Erreur suppression");
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  };

  return (
    <div className="config-page">
      <h2 className="page-title">Configuration</h2>

      {/* Ville météo */}
      <div className="config-section">
        <div className="config-section-header">
          <h3>Ville météo</h3>
        </div>
        {city && (
          <div className="city-current">
            <span className="city-name">{city.name}</span>
            <span className="city-coords">{city.latitude.toFixed(4)}, {city.longitude.toFixed(4)}</span>
          </div>
        )}
        <div className="city-search-wrapper">
          <input
            type="text"
            className="routine-input"
            placeholder="Rechercher une ville…"
            value={citySearch}
            onChange={(e) => handleCitySearch(e.target.value)}
          />
          {searching && <span className="config-hint">Recherche…</span>}
          {cityResults.length > 0 && (
            <div className="city-results">
              {cityResults.map((r, i) => (
                <button key={i} className="city-result-btn" onClick={() => selectCity(r)}>
                  <span className="city-result-name">{r.name}</span>
                  <span className="city-result-detail">
                    {[r.admin1, r.country].filter(Boolean).join(", ")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Menu latéral */}
      <div className="config-section">
        <div className="config-section-header">
          <h3>Menu latéral</h3>
        </div>
        <p className="config-hint">Ordre et visibilité des pages dans le menu.</p>
        <div className="menu-items-list">
          {menuItems.map((item, idx) => {
            const hidden = isHidden(item.id);
            return (
              <div key={item.id} className={`menu-item-row ${hidden ? "menu-item-hidden" : ""}`}>
                <div className="menu-item-reorder">
                  <button
                    className="btn-reorder"
                    onClick={() => moveItem(item.id, -1)}
                    disabled={idx === 0}
                    aria-label="Monter"
                  >&#9650;</button>
                  <button
                    className="btn-reorder"
                    onClick={() => moveItem(item.id, 1)}
                    disabled={idx === menuItems.length - 1}
                    aria-label="Descendre"
                  >&#9660;</button>
                </div>
                <span className="menu-item-icon">{item.icon}</span>
                <span className="menu-item-label">{item.label}</span>
                {item.required ? (
                  <span className="config-hint">Toujours visible</span>
                ) : (
                  <button
                    className={`menu-visibility-toggle ${hidden ? "" : "active"}`}
                    onClick={() => setHidden(item.id, !hidden)}
                  >
                    {hidden ? "Afficher" : "Masquer"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Magasin préféré */}
      <div className="config-section">
        <div className="config-section-header">
          <h3>Magasin préféré</h3>
        </div>
        <div className="store-pick">
          {Object.entries(STORES).map(([key, label]) => (
            <button
              key={key}
              className={`category-btn ${store === key ? "active" : ""}`}
              onClick={() => handleStoreChange(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Musiques réveil */}
      <div className="config-section">
        <div className="config-section-header">
          <h3>Musiques réveil ({files.length})</h3>
          <label className={`btn-upload ${uploading ? "disabled" : ""}`}>
            {uploading ? "Envoi..." : "+ Ajouter MP3"}
            <input
              ref={inputRef}
              type="file"
              accept=".mp3,audio/mpeg"
              onChange={handleUpload}
              disabled={uploading}
              hidden
            />
          </label>
        </div>

        {error && <p className="config-error">{error}</p>}

        <div className="music-list">
          {files.length === 0 && <p className="log-empty">Aucun fichier MP3</p>}
          {files.map((f) => (
            <div key={f.name} className="music-card">
              <div className="music-info">
                <span className="music-name">{f.name}</span>
                <span className="music-size">{formatSize(f.size)}</span>
              </div>
              <button className="btn-delete-routine" onClick={() => handleDelete(f.name)}>×</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
