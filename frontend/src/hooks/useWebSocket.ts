/**
 * Hook WebSocket avec authentification.
 *
 * Se connecte au proxy WS du serveur Node, envoie le JWT,
 * puis relay les messages depuis/vers le backend.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { flushSync } from "react-dom";

const WS_URL = import.meta.env.DEV
  ? "ws://localhost:3000/ws"
  : `ws://${window.location.host}/ws`;

interface WSMessage {
  type: string;
  payload: Record<string, unknown>;
}

export function useWebSocket(token: string | null) {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WSMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!token) return;

    let ws: WebSocket | null = null;

    // Différer la connexion WS pour éviter que Firefox la coupe
    // pendant le chargement initial de la page
    const timer = setTimeout(() => {
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        ws!.send(JSON.stringify({ type: "auth", payload: { token } }));
      };

      ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);
          if (msg.type === "authenticated") { setConnected(true); return; }
          if (msg.type === "error") { console.error("[ws] Erreur :", msg.payload); return; }
          // flushSync garantit que chaque message déclenche un render
          // avant que le prochain onmessage ne soit traité,
          // évitant ainsi la perte de messages par batching React.
          flushSync(() => setLastMessage(msg));
        } catch {
          console.warn("[ws] Message non-JSON reçu :", event.data);
        }
      };

      ws.onclose = () => setConnected(false);
      ws.onerror = () => {};
    }, 200);

    return () => {
      clearTimeout(timer);
      if (ws) ws.close();
      wsRef.current = null;
      setConnected(false);
    };
  }, [token]);

  const send = useCallback((message: WSMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { connected, lastMessage, send };
}
