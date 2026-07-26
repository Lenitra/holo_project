/**
 * Réglage de la ville météo (recherche Open-Meteo + sauvegarde REST).
 *
 * Utilisé par le Dashboard, au plus près du bouton Météo. La ville sert aussi
 * de point d'observation par défaut au module Avions.
 */

import { useState, useEffect, useRef } from "react";

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

export function CitySettings() {
  const [city, setCity] = useState<City | null>(null);
  const [citySearch, setCitySearch] = useState("");
  const [cityResults, setCityResults] = useState<GeoResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/settings/city`)
      .then((r) => r.json())
      .then(setCity)
      .catch(() => {});
  }, []);

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

  return (
    <>
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
    </>
  );
}
