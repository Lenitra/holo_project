/**
 * Hook d'authentification — PIN → JWT, stocké en localStorage.
 */

import { useState, useEffect, useCallback } from "react";

const TOKEN_KEY = "holo_remote_token";
const API = import.meta.env.DEV ? "http://localhost:3000" : "";

export function useAuth() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Vérifier le token existant au montage
  useEffect(() => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (!t) { setLoading(false); return; }

    fetch(`${API}/api/auth/verify`, { headers: { Authorization: `Bearer ${t}` } })
      .then((r) => {
        if (r.ok) { setToken(t); setAuthenticated(true); }
        else { localStorage.removeItem(TOKEN_KEY); }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (pin: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Erreur"); setLoading(false); return; }
      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setAuthenticated(true);
    } catch {
      setError("Impossible de contacter le serveur");
    }
    setLoading(false);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setAuthenticated(false);
  }, []);

  return { authenticated, loading, error, token, login, logout };
}
