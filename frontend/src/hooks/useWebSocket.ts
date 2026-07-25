/**
 * Hook WebSocket avec authentification.
 *
 * Se connecte au proxy WS du serveur Node, envoie le JWT,
 * puis relay les messages depuis/vers le backend.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { flushSync } from "react-dom";

// En prod le front est servi via le tunnel Cloudflare en HTTPS : il faut
// alors un WebSocket sécurisé (wss://), sinon le navigateur bloque la
// connexion (mixed content) et la télécommande ne joint jamais le backend.
const WS_URL = import.meta.env.DEV
  ? "ws://localhost:3000/ws"
  : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;

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

    let stopped = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
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

      ws.onclose = () => {
        setConnected(false);
        // Reconnexion automatique tant que le hook est monté : survit aux
        // redémarrages du backend et aux coupures du tunnel Cloudflare.
        if (!stopped && !reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
          }, 3000);
        }
      };

      ws.onerror = () => {};
    };

    // Différer la connexion WS pour éviter que Firefox la coupe
    // pendant le chargement initial de la page
    const timer = setTimeout(connect, 200);

    return () => {
      stopped = true;
      clearTimeout(timer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
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
