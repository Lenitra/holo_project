/**
 * Page liste de courses.
 */

import { useState, useEffect, useRef } from "react";

interface WSMessage {
  type: string;
  payload: Record<string, unknown>;
}

interface ShoppingItem {
  id: string;
  text: string;
  checked: boolean;
}

interface Props {
  connected: boolean;
  lastMessage: WSMessage | null;
  onSend: (msg: WSMessage) => void;
}

const API_BASE = import.meta.env.DEV ? "http://localhost:3000" : "";

const STORE_URLS: Record<string, (q: string) => string> = {
  carrefour: (q) => `https://www.carrefour.fr/s?q=${encodeURIComponent(q)}`,
  intermarche: (q) => `https://www.intermarche.com/recherche/${encodeURIComponent(q)}`,
};

const STORE_LABELS: Record<string, string> = {
  carrefour: "Carrefour",
  intermarche: "Intermarché",
};

export function ShoppingPage({ connected, lastMessage, onSend }: Props) {
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [newText, setNewText] = useState("");
  const [store, setStore] = useState("carrefour");
  const lastProcessed = useRef<WSMessage | null>(null);

  // Charger le magasin préféré
  useEffect(() => {
    fetch(`${API_BASE}/api/settings/store`)
      .then((r) => r.json())
      .then((d) => setStore(d.store || "carrefour"))
      .catch(() => {});
  }, []);

  // Demander la liste à la connexion
  useEffect(() => {
    if (connected) onSend({ type: "shopping.list", payload: {} });
  }, [connected]);

  // Traiter les messages shopping
  useEffect(() => {
    if (!lastMessage || lastMessage === lastProcessed.current) return;
    if (!lastMessage.type.startsWith("shopping.")) return;
    lastProcessed.current = lastMessage;

    switch (lastMessage.type) {
      case "shopping.list":
        setItems(lastMessage.payload.items as ShoppingItem[]);
        break;
      case "shopping.added":
        setItems((prev) => [...prev, lastMessage.payload as unknown as ShoppingItem]);
        break;
      case "shopping.toggled": {
        const toggled = lastMessage.payload as unknown as ShoppingItem;
        setItems((prev) => prev.map((i) => (i.id === toggled.id ? toggled : i)));
        break;
      }
      case "shopping.deleted": {
        const id = lastMessage.payload.id as string;
        setItems((prev) => prev.filter((i) => i.id !== id));
        break;
      }
      case "shopping.cleared":
        setItems(lastMessage.payload.items as ShoppingItem[]);
        break;
    }
  }, [lastMessage]);

  const handleAdd = () => {
    const text = newText.trim();
    if (!text) return;
    onSend({ type: "shopping.add", payload: { text } });
    setNewText("");
  };

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleAdd();
  };

  const storeUrl = STORE_URLS[store] || STORE_URLS.carrefour;

  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);

  return (
    <div className="shopping-page">
      <h2 className="page-title">Liste de courses</h2>

      <div className="shopping-add">
        <input
          type="text"
          className="routine-input shopping-input"
          placeholder="Ajouter un article…"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={!connected}
        />
        <button className="btn-confirm-routine shopping-add-btn" onClick={handleAdd} disabled={!connected || !newText.trim()}>
          +
        </button>
      </div>

      <div className="shopping-list">
        {unchecked.length === 0 && checked.length === 0 && (
          <p className="log-empty">Liste vide</p>
        )}
        {unchecked.map((item) => (
          <div key={item.id} className="shopping-item">
            <button className="shopping-check" onClick={() => onSend({ type: "shopping.toggle", payload: { id: item.id } })} />
            <span className="shopping-text">{item.text}</span>
            <a
              className="btn-store-link"
              href={storeUrl(item.text)}
              target="_blank"
              rel="noopener"
              title={`Chercher sur ${STORE_LABELS[store]}`}
            >
              &#128269;
            </a>
            <button className="btn-delete-routine" onClick={() => onSend({ type: "shopping.delete", payload: { id: item.id } })}>×</button>
          </div>
        ))}
      </div>

      {checked.length > 0 && (
        <div className="shopping-checked-section">
          <div className="shopping-checked-header">
            <span className="config-label">Fait ({checked.length})</span>
            <button
              className="btn-add-routine"
              onClick={() => onSend({ type: "shopping.clear", payload: {} })}
            >
              Vider
            </button>
          </div>
          <div className="shopping-list">
            {checked.map((item) => (
              <div key={item.id} className="shopping-item shopping-item-done">
                <button className="shopping-check checked" onClick={() => onSend({ type: "shopping.toggle", payload: { id: item.id } })} />
                <span className="shopping-text">{item.text}</span>
                <button className="btn-delete-routine" onClick={() => onSend({ type: "shopping.delete", payload: { id: item.id } })}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Magasin utilisé par la loupe de recherche drive */}
      <div className="config-section">
        <div className="config-section-header">
          <h3>Magasin drive</h3>
        </div>
        <p className="config-hint">La loupe de chaque article cherche sur ce site.</p>
        <div className="store-pick">
          {Object.entries(STORE_LABELS).map(([key, label]) => (
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
    </div>
  );
}
