/**
 * Bibliothèque des MP3 de réveil (upload / liste / suppression).
 *
 * Utilisée par le Dashboard, à côté des routines qui consomment ces fichiers.
 */

import { useState, useEffect, useRef } from "react";

interface MusicFile {
  name: string;
  size: number;
}

const API_BASE = import.meta.env.DEV ? "http://localhost:3000" : "";

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
};

export function MusicLibrary() {
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

  return (
    <>
      <div className="music-lib-header">
        <span className="config-hint">{files.length} fichier(s)</span>
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
    </>
  );
}
