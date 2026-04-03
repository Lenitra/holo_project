/**
 * Écran de login PIN.
 *
 * Affiche un pavé numérique pour saisir le code PIN.
 * Pensé pour mobile : gros boutons, feedback visuel.
 */

import { useState } from "react";

interface Props {
  onSubmit: (pin: string) => void;
  error: string | null;
  loading: boolean;
}

export function LoginScreen({ onSubmit, error, loading }: Props) {
  const [pin, setPin] = useState("");

  const handleDigit = (digit: string) => {
    if (pin.length < 6) {
      const newPin = pin + digit;
      setPin(newPin);
    }
  };

  const handleDelete = () => {
    setPin((p) => p.slice(0, -1));
  };

  const handleSubmit = () => {
    if (pin.length > 0) {
      onSubmit(pin);
      setPin("");
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>Holo Remote</h1>
        <p className="login-subtitle">Entrez le code PIN</p>

        {/* Indicateurs de saisie (points) */}
        <div className="pin-dots">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`pin-dot ${i < pin.length ? "filled" : ""}`}
            />
          ))}
        </div>

        {/* Message d'erreur */}
        {error && <p className="login-error">{error}</p>}

        {/* Pavé numérique */}
        <div className="numpad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              className="numpad-btn"
              onClick={() => handleDigit(d)}
              disabled={loading}
            >
              {d}
            </button>
          ))}
          <button
            className="numpad-btn numpad-delete"
            onClick={handleDelete}
            disabled={loading || pin.length === 0}
          >
            ←
          </button>
          <button
            className="numpad-btn"
            onClick={() => handleDigit("0")}
            disabled={loading}
          >
            0
          </button>
          <button
            className="numpad-btn numpad-submit"
            onClick={handleSubmit}
            disabled={loading || pin.length === 0}
          >
            {loading ? "..." : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
