/**
 * Page liste de courses + repas.
 *
 * Un repas est une liste d'ingrédients réutilisable : le sélectionner verse
 * ses ingrédients dans la liste (sans doublons, les articles cochés sont
 * re-décochés).
 */

import { useState, useEffect, useRef } from "react";
import { Fold } from "../components/Fold";

interface WSMessage {
  type: string;
  payload: Record<string, unknown>;
}

interface ShoppingItem {
  id: string;
  text: string;
  checked: boolean;
}

interface Meal {
  id: string;
  name: string;
  ingredients: string[];
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

  // ── Repas ───────────────────────────────────────────────────────
  const [meals, setMeals] = useState<Meal[]>([]);
  // null = fermé, undefined = création, string = id du repas édité
  const [mealFormId, setMealFormId] = useState<string | null | undefined>(null);
  const [mealName, setMealName] = useState("");
  const [mealIngredients, setMealIngredients] = useState<string[]>([]);
  const [ingredientInput, setIngredientInput] = useState("");
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const mealFormOpen = mealFormId !== null;

  const flash = (message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 5000);
  };

  // Charger le magasin préféré
  useEffect(() => {
    fetch(`${API_BASE}/api/settings/store`)
      .then((r) => r.json())
      .then((d) => setStore(d.store || "carrefour"))
      .catch(() => {});
  }, []);

  // Demander la liste et les repas à la connexion
  useEffect(() => {
    if (connected) {
      onSend({ type: "shopping.list", payload: {} });
      onSend({ type: "shopping.meals", payload: {} });
    }
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
      case "shopping.meals":
        setMeals(lastMessage.payload.meals as unknown as Meal[]);
        break;
      case "shopping.meal_added":
        setMeals((prev) => [...prev, lastMessage.payload as unknown as Meal]);
        break;
      case "shopping.meal_updated": {
        const updated = lastMessage.payload as unknown as Meal;
        setMeals((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        break;
      }
      case "shopping.meal_deleted": {
        const id = lastMessage.payload.id as string;
        setMeals((prev) => prev.filter((m) => m.id !== id));
        break;
      }
      case "shopping.merged": {
        const p = lastMessage.payload;
        setItems(p.items as ShoppingItem[]);
        const parts: string[] = [];
        if (p.added) parts.push(`${p.added} ajouté(s)`);
        if (p.restored) parts.push(`${p.restored} re-décoché(s)`);
        if (p.skipped) parts.push(`${p.skipped} déjà présent(s)`);
        flash(`« ${p.meal} » → liste : ${parts.join(", ") || "rien à faire"}`);
        break;
      }
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

  // ── Formulaire repas ────────────────────────────────────────────

  const openMealCreate = () => {
    setMealFormId(undefined);
    setMealName("");
    setMealIngredients([]);
    setIngredientInput("");
  };

  const openMealEdit = (meal: Meal) => {
    setMealFormId(meal.id);
    setMealName(meal.name);
    setMealIngredients([...meal.ingredients]);
    setIngredientInput("");
  };

  const closeMealForm = () => setMealFormId(null);

  const addIngredient = () => {
    const text = ingredientInput.trim();
    if (!text) return;
    if (!mealIngredients.some((i) => i.toLowerCase() === text.toLowerCase())) {
      setMealIngredients((prev) => [...prev, text]);
    }
    setIngredientInput("");
  };

  const removeIngredient = (index: number) => {
    setMealIngredients((prev) => prev.filter((_, i) => i !== index));
  };

  const submitMeal = () => {
    const name = mealName.trim();
    // L'ingrédient en cours de saisie compte aussi (oubli du + fréquent sur mobile)
    const pending = ingredientInput.trim();
    const ingredients = pending && !mealIngredients.some((i) => i.toLowerCase() === pending.toLowerCase())
      ? [...mealIngredients, pending]
      : mealIngredients;
    if (!name || ingredients.length === 0) return;

    if (typeof mealFormId === "string") {
      onSend({ type: "shopping.meal_update", payload: { id: mealFormId, name, ingredients } });
    } else {
      onSend({ type: "shopping.meal_add", payload: { name, ingredients } });
    }
    closeMealForm();
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

      {/* Repas : listes d'ingrédients réutilisables */}
      <Fold title={`Repas (${meals.length})`}>
        {notice && <p className="spotify-notice">{notice}</p>}

        <div className="meals-header">
          <p className="config-hint">Toucher un repas ajoute ses ingrédients à la liste.</p>
          <button
            className="btn-add-routine"
            onClick={() => (mealFormOpen ? closeMealForm() : openMealCreate())}
            disabled={!connected}
          >
            {mealFormOpen ? "Annuler" : "+ Ajouter"}
          </button>
        </div>

        {mealFormOpen && (
          <div className="routine-form">
            <input
              type="text"
              className="routine-input"
              placeholder="Nom du repas (ex : Lasagnes)"
              value={mealName}
              onChange={(e) => setMealName(e.target.value)}
            />
            <div className="shopping-add">
              <input
                type="text"
                className="routine-input shopping-input"
                placeholder="Ajouter un ingrédient…"
                value={ingredientInput}
                onChange={(e) => setIngredientInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addIngredient();
                  }
                }}
              />
              <button
                className="btn-confirm-routine shopping-add-btn"
                onClick={addIngredient}
                disabled={!ingredientInput.trim()}
              >
                +
              </button>
            </div>
            {mealIngredients.length > 0 && (
              <div className="chip-list">
                {mealIngredients.map((ing, i) => (
                  <span key={`${ing}-${i}`} className="chip">
                    {ing}
                    <button className="chip-remove" onClick={() => removeIngredient(i)} aria-label="Retirer">×</button>
                  </span>
                ))}
              </div>
            )}
            <button
              className="btn-confirm-routine"
              onClick={submitMeal}
              disabled={!connected || !mealName.trim() || (mealIngredients.length === 0 && !ingredientInput.trim())}
            >
              {typeof mealFormId === "string" ? "Enregistrer" : "Créer le repas"}
            </button>
          </div>
        )}

        <div className="meals-list">
          {meals.length === 0 && !mealFormOpen && <p className="log-empty">Aucun repas</p>}
          {meals.map((m) => (
            <div key={m.id} className={`meal-card ${mealFormId === m.id ? "editing" : ""}`}>
              <button
                className="meal-main"
                onClick={() => onSend({ type: "shopping.meal_to_list", payload: { id: m.id } })}
                disabled={!connected}
                title="Ajouter les ingrédients à la liste"
              >
                <span className="meal-name">{m.name}</span>
                <span className="meal-meta">{m.ingredients.join(", ")}</span>
              </button>
              <button className="btn-edit-routine" onClick={() => openMealEdit(m)}>&#9998;</button>
              <button className="btn-delete-routine" onClick={() => onSend({ type: "shopping.meal_delete", payload: { id: m.id } })}>×</button>
            </div>
          ))}
        </div>
      </Fold>

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
