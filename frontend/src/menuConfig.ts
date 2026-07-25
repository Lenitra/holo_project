/**
 * Configuration du menu latéral : ordre et visibilité des liens.
 *
 * Persisté en localStorage. La Configuration est toujours visible
 * pour qu'on puisse toujours y accéder.
 */

export interface MenuItem {
  id: string;
  path: string;
  label: string;
  icon: string;
  required?: boolean; // toujours visible si true
}

export const DEFAULT_MENU: MenuItem[] = [
  { id: "dashboard", path: "/", label: "Dashboard", icon: "\u268F" },
  { id: "shopping", path: "/shopping", label: "Courses", icon: "\u262D" },
  { id: "workout", path: "/workout", label: "Sport", icon: "\u26AB" },
  { id: "planes", path: "/planes", label: "Avions", icon: "\u2708" },
  { id: "config", path: "/config", label: "Configuration", icon: "\u2699", required: true },
  { id: "debug", path: "/debug", label: "Debug", icon: "\u270E" },
];

const STORAGE_KEY = "holo.menuConfig";

interface StoredConfig {
  order: string[]; // liste d'ids dans l'ordre voulu
  hidden: string[]; // liste d'ids masqués
}

function readStorage(): StoredConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { order: [], hidden: [] };
}

function writeStorage(config: StoredConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {}
}

/** Retourne les items visibles, dans l'ordre configuré. */
export function getVisibleMenu(): MenuItem[] {
  const { order, hidden } = readStorage();
  const byId = new Map(DEFAULT_MENU.map((i) => [i.id, i]));

  // Ordre : d'abord les items connus de `order`, puis les nouveaux
  const ordered: MenuItem[] = [];
  const seen = new Set<string>();
  for (const id of order) {
    const item = byId.get(id);
    if (item) {
      ordered.push(item);
      seen.add(id);
    }
  }
  for (const item of DEFAULT_MENU) {
    if (!seen.has(item.id)) ordered.push(item);
  }

  return ordered.filter((i) => i.required || !hidden.includes(i.id));
}

/** Retourne tous les items dans l'ordre configuré (visibles + masqués). */
export function getAllMenuInOrder(): MenuItem[] {
  const { order } = readStorage();
  const byId = new Map(DEFAULT_MENU.map((i) => [i.id, i]));
  const ordered: MenuItem[] = [];
  const seen = new Set<string>();
  for (const id of order) {
    const item = byId.get(id);
    if (item) {
      ordered.push(item);
      seen.add(id);
    }
  }
  for (const item of DEFAULT_MENU) {
    if (!seen.has(item.id)) ordered.push(item);
  }
  return ordered;
}

export function isHidden(id: string): boolean {
  const item = DEFAULT_MENU.find((i) => i.id === id);
  if (item?.required) return false;
  return readStorage().hidden.includes(id);
}

export function setHidden(id: string, hidden: boolean) {
  const config = readStorage();
  const set = new Set(config.hidden);
  if (hidden) set.add(id);
  else set.delete(id);
  config.hidden = Array.from(set);
  writeStorage(config);
  notify();
}

export function moveItem(id: string, direction: -1 | 1) {
  const items = getAllMenuInOrder();
  const idx = items.findIndex((i) => i.id === id);
  if (idx < 0) return;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= items.length) return;
  [items[idx], items[newIdx]] = [items[newIdx], items[idx]];
  const config = readStorage();
  config.order = items.map((i) => i.id);
  writeStorage(config);
  notify();
}

// ── Événement de changement pour que le Layout se rafraîchisse ──

const listeners = new Set<() => void>();

export function subscribeMenuChanges(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn());
}
