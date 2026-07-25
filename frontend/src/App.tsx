/**
 * Composant racine de la télécommande.
 *
 * Gère l'authentification, le WebSocket, et le routing entre les pages.
 * Le traitement des messages WS est centralisé ici pour que les logs
 * s'accumulent même quand on navigue entre les pages.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { useWebSocket } from "./hooks/useWebSocket";
import { LoginScreen } from "./components/LoginScreen";
import { Layout } from "./components/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { ConfigPage } from "./pages/ConfigPage";
import { ShoppingPage } from "./pages/ShoppingPage";
import { WorkoutPage } from "./pages/WorkoutPage";
import { PlanesPage } from "./pages/PlanesPage";
import { DebugPage } from "./pages/DebugPage";
import "./App.css";

interface WSMessage {
  type: string;
  payload: Record<string, unknown>;
}

interface ClientInfo {
  id: string;
  role: string;
}

interface Routine {
  id: string;
  name: string;
  action: string;
  time: string;
  days: number[];
  enabled: boolean;
  config: Record<string, unknown>;
}

function App() {
  const { authenticated, loading, error, token, login, logout } = useAuth();
  const { connected, lastMessage, send } = useWebSocket(
    authenticated ? token : null
  );

  const [log, setLog] = useState<string[]>([]);
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const lastProcessed = useRef<WSMessage | null>(null);

  // Demander le status et les routines à la connexion
  useEffect(() => {
    if (connected) {
      send({ type: "status", payload: {} });
      send({ type: "routine.list", payload: {} });
    }
  }, [connected]);

  // Traiter les messages reçus (centralisé pour persister entre les pages)
  useEffect(() => {
    if (!lastMessage || lastMessage === lastProcessed.current) return;
    lastProcessed.current = lastMessage;

    if (lastMessage.type === "status" && lastMessage.payload.clients) {
      const raw = lastMessage.payload.clients as Record<string, { role: string }>;
      setClients(Object.entries(raw).map(([id, info]) => ({ id, role: info.role })));
    }

    if (lastMessage.type === "routine.list") {
      setRoutines(lastMessage.payload.routines as Routine[]);
    }
    if (lastMessage.type === "routine.added") {
      setRoutines((prev) => [...prev, lastMessage.payload as unknown as Routine]);
    }
    if (lastMessage.type === "routine.updated") {
      const updated = lastMessage.payload as unknown as Routine;
      setRoutines((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    }
    if (lastMessage.type === "routine.deleted") {
      const id = lastMessage.payload.id as string;
      setRoutines((prev) => prev.filter((r) => r.id !== id));
    }

    setLog((prev) => [...prev.slice(-49), `← ${lastMessage.type}: ${JSON.stringify(lastMessage.payload)}`]);
  }, [lastMessage]);

  // Wrapper send qui ajoute au log
  const handleSend = useCallback((msg: WSMessage) => {
    send(msg);
    setLog((prev) => [
      ...prev.slice(-49),
      `→ ${msg.type} ${Object.keys(msg.payload).length ? JSON.stringify(msg.payload) : ""}`,
    ]);
  }, [send]);

  // Écran de chargement
  if (loading && !error) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Chargement...</p>
      </div>
    );
  }

  // Non authentifié → écran PIN
  if (!authenticated) {
    return <LoginScreen onSubmit={login} error={error} loading={loading} />;
  }

  // Authentifié → app avec navigation
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout connected={connected} onLogout={logout} />}>
          <Route index element={<DashboardPage connected={connected} routines={routines} onSend={handleSend} />} />
          <Route path="shopping" element={<ShoppingPage connected={connected} lastMessage={lastMessage} onSend={handleSend} />} />
          <Route path="workout" element={<WorkoutPage connected={connected} lastMessage={lastMessage} onSend={handleSend} />} />
          <Route path="planes" element={<PlanesPage connected={connected} lastMessage={lastMessage} onSend={handleSend} />} />
          <Route path="config" element={<ConfigPage />} />
          <Route path="debug" element={<DebugPage connected={connected} clients={clients} log={log} onSend={handleSend} token={token} />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
