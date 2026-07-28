/**
 * Page Todo : plusieurs listes de tâches indépendantes.
 *
 * Vue d'ensemble = les listes (avec leur avancement), puis on ouvre une liste
 * pour gérer ses tâches. Le backend renvoie toujours la liste complète après
 * une modification, donc l'état local se remplace tel quel.
 */

import { useState, useEffect, useRef } from "react";
import { ConfirmModal } from "../components/ConfirmModal";

interface WSMessage {
  type: string;
  payload: Record<string, unknown>;
}

interface TodoItem {
  id: string;
  text: string;
  done: boolean;
}

interface TodoList {
  id: string;
  name: string;
  items: TodoItem[];
}

interface Props {
  connected: boolean;
  lastMessage: WSMessage | null;
  onSend: (msg: WSMessage) => void;
}

export function TodoPage({ connected, lastMessage, onSend }: Props) {
  const [lists, setLists] = useState<TodoList[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const lastProcessed = useRef<WSMessage | null>(null);

  // Formulaire liste : null = fermé, undefined = création, string = id renommé
  const [listFormId, setListFormId] = useState<string | null | undefined>(null);
  const [listName, setListName] = useState("");
  const [listToDelete, setListToDelete] = useState<TodoList | null>(null);

  // Tâches
  const [newItem, setNewItem] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemText, setEditingItemText] = useState("");

  const listFormOpen = listFormId !== null;
  const selected = lists.find((l) => l.id === selectedId) ?? null;

  // Demander les listes à la connexion
  useEffect(() => {
    if (connected) onSend({ type: "todo.lists", payload: {} });
  }, [connected]);

  /** Ouvre une liste (ou revient à la vue d'ensemble) sur une saisie vierge. */
  const openList = (id: string | null) => {
    setSelectedId(id);
    setNewItem("");
    setEditingItemId(null);
  };

  // Traiter les messages todo
  useEffect(() => {
    if (!lastMessage || lastMessage === lastProcessed.current) return;
    if (!lastMessage.type.startsWith("todo.")) return;
    lastProcessed.current = lastMessage;

    switch (lastMessage.type) {
      case "todo.lists":
        setLists(lastMessage.payload.lists as unknown as TodoList[]);
        break;
      case "todo.list_added": {
        const added = lastMessage.payload as unknown as TodoList;
        setLists((prev) => [...prev, added]);
        setSelectedId(added.id); // on enchaîne sur le remplissage de la liste
        break;
      }
      case "todo.list_updated": {
        const updated = lastMessage.payload as unknown as TodoList;
        setLists((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
        break;
      }
      case "todo.list_deleted": {
        const id = lastMessage.payload.id as string;
        setLists((prev) => prev.filter((l) => l.id !== id));
        setSelectedId((prev) => (prev === id ? null : prev));
        break;
      }
    }
  }, [lastMessage]);

  // ── Listes ──────────────────────────────────────────────────────

  const openListCreate = () => {
    setListFormId(undefined);
    setListName("");
  };

  const openListRename = (list: TodoList) => {
    setListFormId(list.id);
    setListName(list.name);
  };

  const closeListForm = () => setListFormId(null);

  const submitList = () => {
    const name = listName.trim();
    if (!name) return;
    if (typeof listFormId === "string") {
      onSend({ type: "todo.list_rename", payload: { id: listFormId, name } });
    } else {
      onSend({ type: "todo.list_add", payload: { name } });
    }
    closeListForm();
  };

  const confirmDeleteList = () => {
    if (!listToDelete) return;
    onSend({ type: "todo.list_delete", payload: { id: listToDelete.id } });
    setListToDelete(null);
  };

  // ── Tâches ──────────────────────────────────────────────────────

  const addItem = () => {
    const text = newItem.trim();
    if (!text || !selected) return;
    onSend({ type: "todo.item_add", payload: { list_id: selected.id, text } });
    setNewItem("");
  };

  const toggleItem = (item: TodoItem) => {
    if (!selected) return;
    onSend({ type: "todo.item_toggle", payload: { list_id: selected.id, id: item.id } });
  };

  const deleteItem = (item: TodoItem) => {
    if (!selected) return;
    onSend({ type: "todo.item_delete", payload: { list_id: selected.id, id: item.id } });
  };

  const openItemEdit = (item: TodoItem) => {
    setEditingItemId(item.id);
    setEditingItemText(item.text);
  };

  // Un texte vide ou inchangé referme simplement l'édition
  const submitItemEdit = () => {
    const text = editingItemText.trim();
    if (text && selected && editingItemId) {
      onSend({ type: "todo.item_update", payload: { list_id: selected.id, id: editingItemId, text } });
    }
    setEditingItemId(null);
  };

  // ── Vue détail d'une liste ──────────────────────────────────────

  if (selected) {
    const todo = selected.items.filter((i) => !i.done);
    const done = selected.items.filter((i) => i.done);

    return (
      <div className="todo-page">
        <button className="btn-back" onClick={() => openList(null)}>
          &#8592; Toutes les listes
        </button>
        <h2 className="page-title">{selected.name}</h2>

        <div className="shopping-add">
          <input
            type="text"
            className="routine-input shopping-input"
            placeholder="Ajouter une tâche…"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
            disabled={!connected}
          />
          <button
            className="btn-confirm-routine shopping-add-btn"
            onClick={addItem}
            disabled={!connected || !newItem.trim()}
          >
            +
          </button>
        </div>

        <div className="shopping-list">
          {todo.length === 0 && done.length === 0 && <p className="log-empty">Aucune tâche</p>}
          {todo.map((item) => (
            <div key={item.id} className="todo-item">
              <button className="todo-check" onClick={() => toggleItem(item)} />
              {editingItemId === item.id ? (
                <input
                  type="text"
                  className="routine-input todo-edit-input"
                  value={editingItemText}
                  onChange={(e) => setEditingItemText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitItemEdit();
                    if (e.key === "Escape") setEditingItemId(null);
                  }}
                  onBlur={submitItemEdit}
                  autoFocus
                />
              ) : (
                <span className="todo-text">{item.text}</span>
              )}
              <button className="btn-edit-routine" onClick={() => openItemEdit(item)}>
                &#9998;
              </button>
              <button className="btn-delete-routine" onClick={() => deleteItem(item)}>
                ×
              </button>
            </div>
          ))}
        </div>

        {done.length > 0 && (
          <div className="shopping-checked-section">
            <div className="shopping-checked-header">
              <span className="config-label">Fait ({done.length})</span>
              <button
                className="btn-add-routine"
                onClick={() => onSend({ type: "todo.clear_done", payload: { list_id: selected.id } })}
              >
                Vider
              </button>
            </div>
            <div className="shopping-list">
              {done.map((item) => (
                <div key={item.id} className="todo-item todo-item-done">
                  <button className="todo-check checked" onClick={() => toggleItem(item)} />
                  <span className="todo-text">{item.text}</span>
                  <button className="btn-delete-routine" onClick={() => deleteItem(item)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Vue d'ensemble : toutes les listes ──────────────────────────

  return (
    <div className="todo-page">
      <h2 className="page-title">Listes de tâches</h2>

      <div className="meals-header">
        <p className="config-hint">Toucher une liste pour voir et cocher ses tâches.</p>
        <button
          className="btn-add-routine"
          onClick={() => (listFormOpen ? closeListForm() : openListCreate())}
          disabled={!connected}
        >
          {listFormOpen ? "Annuler" : "+ Ajouter"}
        </button>
      </div>

      {listFormOpen && (
        <div className="routine-form">
          <input
            type="text"
            className="routine-input"
            placeholder="Nom de la liste (ex : Maison)"
            value={listName}
            onChange={(e) => setListName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitList()}
            autoFocus
          />
          <button
            className="btn-confirm-routine"
            onClick={submitList}
            disabled={!connected || !listName.trim()}
          >
            {typeof listFormId === "string" ? "Renommer" : "Créer la liste"}
          </button>
        </div>
      )}

      <div className="todo-lists">
        {lists.length === 0 && !listFormOpen && <p className="log-empty">Aucune liste</p>}
        {lists.map((list) => {
          const done = list.items.filter((i) => i.done).length;
          return (
            <div key={list.id} className={`meal-card ${listFormId === list.id ? "editing" : ""}`}>
              <button className="meal-main" onClick={() => openList(list.id)}>
                <span className="meal-name">{list.name}</span>
                <span className="meal-meta">
                  {list.items.length === 0
                    ? "Vide"
                    : `${done}/${list.items.length} fait${done > 1 ? "s" : ""}`}
                </span>
              </button>
              <button className="btn-edit-routine" onClick={() => openListRename(list)}>
                &#9998;
              </button>
              <button className="btn-delete-routine" onClick={() => setListToDelete(list)}>
                ×
              </button>
            </div>
          );
        })}
      </div>

      <ConfirmModal
        open={listToDelete !== null}
        title="Supprimer la liste"
        message={`Supprimer « ${listToDelete?.name} » et ses ${listToDelete?.items.length ?? 0} tâche(s) ?`}
        onConfirm={confirmDeleteList}
        onCancel={() => setListToDelete(null)}
      />
    </div>
  );
}
