/**
 * Composant racine de la télécommande.
 *
 * Gère le routing entre l'écran de login (PIN) et le panneau remote.
 * L'état d'authentification détermine quel écran afficher.
 */

import { useAuth } from "./hooks/useAuth";
import { useWebSocket } from "./hooks/useWebSocket";
import { LoginScreen } from "./components/LoginScreen";
import { RemotePanel } from "./components/RemotePanel";
import "./App.css";

function App() {
  const { authenticated, loading, error, token, login, logout } = useAuth();
  const { connected, lastMessage, send } = useWebSocket(
    authenticated ? token : null
  );

  // Écran de chargement pendant la vérification du token
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

  // Authentifié → panneau remote
  return (
    <RemotePanel
      connected={connected}
      lastMessage={lastMessage}
      send={send}
      onLogout={logout}
    />
  );
}

export default App;
