/**
 * Section repliable : un titre cliquable qui montre/cache son contenu.
 * Utilisée pour les réglages intégrés aux pages des modules.
 */

import { useState } from "react";

interface Props {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function Fold({ title, defaultOpen = false, children }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="config-section">
      <button className="fold-header" onClick={() => setOpen((v) => !v)}>
        <h3>{title}</h3>
        <span className={`fold-chevron ${open ? "open" : ""}`}>&#9662;</span>
      </button>
      {open && <div className="fold-body">{children}</div>}
    </div>
  );
}
