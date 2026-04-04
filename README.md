# Home Assistant Custom

Assistant domestique custom développé en Python et Node.js, tournant sur un Raspberry Pi avec affichage holographique (pyramide 4 faces), télécommande web et bouton physique.

---

## Architecture

Le système repose sur **2 process** tournant sur le même Raspberry Pi :

1. **Backend Python** — Cerveau du système : logique métier, scheduler, modules, serveur WebSocket central
2. **Serveur Node** — Sert les deux interfaces web (télécommande + hologramme) et proxy WebSocket authentifié

L'hologramme est une **app web affichée dans Firefox en mode kiosk** sur l'écran connecté au RPi. La télécommande est une SPA React accessible à distance.

```
┌──────────────────────────────────────────────────┐
│  Raspberry Pi — 2 process                        │
│                                                  │
│  ┌──────────────────────┐                        │
│  │  Backend Python       │                       │
│  │  Logique métier       │                       │
│  │  Scheduler            │                       │
│  │  Modules              │                       │
│  │  Serveur WS :8765     │                       │
│  └──────────┬────────────┘                       │
│             │ WebSocket (localhost)              │
│  ┌──────────▼────────────┐                       │
│  │  Serveur Node :3000   │                       │
│  │  /hologram → app web  │ ← Firefox kiosk       │
│  │  /remote  → React SPA │ ← accès distant       │
│  │  /ws      → proxy WS  │                       │
│  └──────────┬────────────┘                       │
│             │                                    │
│  [Firefox kiosk] → localhost:3000/hologram       │
│  [Bouton physique] ──GPIO/USB──► Backend         │
└──────────────────────────────────────────────────┘
        │
        ▼ (Cloudflare Tunnel)
 [Télécommande sur mobile]
  navigateur → https://remote.mondomaine.com
```

**Principe fondamental** : le backend est le cerveau unique. Il décide de tout — l'hologramme et la télécommande ne font qu'afficher et transmettre.

---

## Affichage holographique

L'hologramme utilise une **pyramide de Pepper's ghost** à 4 faces en verre/plexiglas. L'écran affiche 4 copies du contenu, chacune orientée vers une face.

```
┌────────┼──────────┼────────┐
│  90°   │   NOIR   │  270°  │
│(gauche)│ (centre) │(droite)│
└────────┼──────────┼────────┘
         │    0°    │
         │  (bas)   │
         └──────────┘
```

- **Fond noir** = transparent sur le verre → seul le contenu "flotte"
- **Avatar animé** : clips vidéo pré-rendus dans Unreal Engine (H.264)
- **Overlay dynamique** : heure, météo, texte en HTML/CSS par-dessus la vidéo
- **~20 états** : idle, talking, alarm, alert, météo, etc.
- Les clips sont déclenchés par le backend via WebSocket

### Pipeline de contenu

```
Unreal Engine → render clips H.264 (fond noir) → dossier clips/
                                                      │
Backend envoie "display.update" ───► App web hologramme
                                      ├── <video> joue le clip
                                      ├── CSS duplique × 4 faces + rotations
                                      └── overlay HTML (texte, données)
```

---

## Stack technique

### Backend Python

| Technologie      | Rôle                                         |
| ---------------- | -------------------------------------------- |
| **Python 3.11+** | Langage principal                            |
| **asyncio**      | Orchestration async — scheduler, modules, WS |
| **websockets**   | Serveur WebSocket central (port 8765)        |
| **APScheduler**  | Planification des réveils et routines        |
| **SQLite**       | Persistance locale (configs, historique)     |
| **bleak**        | Gestion async du Bluetooth (enceintes)       |
| **GPIO / evdev** | Lecture du bouton physique                   |

### Serveur Node

| Technologie | Rôle                                        |
| ----------- | ------------------------------------------- |
| **Node.js** | Serveur HTTP unique (port 3000)             |
| **Express** | Routes `/hologram`, `/remote`, `/api`       |
| **JWT**     | Auth télécommande (PIN → token)             |
| **ws**      | Proxy WebSocket authentifié vers le backend |

### Hologramme (app web)

| Technologie       | Rôle                                           |
| ----------------- | ---------------------------------------------- |
| **HTML/CSS/JS**   | Rendu pyramide 4 faces + overlay               |
| **`<video>`**     | Lecture clips avatar (décodage H.264 hardware) |
| **WebSocket**     | Réception des commandes du backend             |
| **Firefox kiosk** | Affichage plein écran sur l'écran du RPi       |

### Télécommande (React SPA)

| Technologie   | Rôle                                     |
| ------------- | ---------------------------------------- |
| **React**     | Interface de configuration               |
| **WebSocket** | Communication via proxy Node authentifié |

---

## Communication

Tous les échanges passent par le **serveur WebSocket du backend** (`localhost:8765`). Le serveur Node fait proxy pour les clients web.

| Liaison                   | Protocole                                   |
| ------------------------- | ------------------------------------------- |
| Backend ↔ Node (proxy)    | WebSocket local (`ws://localhost:8765`)     |
| Node ↔ Hologramme         | WebSocket local (`ws://localhost:3000/ws`)  |
| Node ↔ Télécommande       | WebSocket via Cloudflare Tunnel (auth JWT)  |
| Backend ↔ Bouton physique | GPIO / USB / evdev                          |
| Accès distant             | Cloudflare Tunnel (télécommande uniquement) |

### Format des messages WebSocket

```json
{
  "type": "display.update",
  "payload": {
    "screen": "alarm",
    "data": { "time": "07:30", "weather": "15°C" }
  }
}
```

Chaque client s'identifie à la connexion (`hologram` ou `remote`) pour que le backend puisse router les messages.

---

## Modules

### V1

- **Réveil / Scheduler** — Alarmes et routines planifiées, configurable via télécommande, stoppable via bouton physique
- **Audio / Bluetooth** — Lecture audio native, routage vers enceintes BT via bleak
- **Hologramme** — App web pyramide 4 faces, clips vidéo + overlay, piloté par le backend
- **Bouton physique** — Appui court = pause/play, double appui = next, appui long = stop réveil

### Futur

- **Spotify** — Contrôle via API Spotify Connect
- **Caméra** — Surveillance vidéo via OpenCV, détection de mouvement
- **Domotique** — Appareils connectés (MQTT sera ajouté à ce moment-là)
- **Commande vocale** — Whisper : voix → texte → intent → action

---

## Exemple de flux : le réveil

1. **7h30** — Le scheduler du backend détecte l'heure du réveil
2. **Backend** — Lance l'audio vers les enceintes Bluetooth (volume progressif)
3. **Backend → Hologramme** — Envoie `display.update` avec `screen: "alarm"`
4. **Hologramme** — Joue le clip `alarm.mp4`, affiche l'overlay (heure, météo)
5. **Bouton** — L'utilisateur fait un appui long → événement `button.long_press`
6. **Backend** — Coupe l'audio, envoie `display.update` avec `screen: "idle"`
7. **Hologramme** — Transition vers le clip `idle.mp4`

---

## Structure du projet

```
holo_project/
├── backend/                    # Process 1 — Backend Python
│   ├── main.py                 # Point d'entrée
│   ├── config.yaml             # Configuration générale
│   ├── core/                   # Socle technique
│   │   ├── config.py           # Loader YAML
│   │   ├── logger.py           # Logger console
│   │   ├── event_bus.py        # Pub/sub async
│   │   ├── protocol.py         # Messages JSON + router
│   │   └── ws_server.py        # Serveur WebSocket
│   ├── modules/                # Modules métier (auto-discovery)
│   │   ├── audio/
│   │   ├── button/
│   │   └── ...
│   └── pyproject.toml
│
├── web_remote/                 # Process 2 — Serveur Node
│   ├── server.ts               # Express + auth + proxy WS
│   ├── src/                    # React SPA (télécommande)
│   │   ├── components/
│   │   └── hooks/
│   ├── hologram/               # App web hologramme
│   │   ├── index.html          # Page pyramide 4 faces
│   │   ├── style.css           # Layout pyramide + overlay
│   │   ├── app.js              # Logique WS + machine à états
│   │   └── clips/              # Vidéos avatar pré-rendues (H.264)
│   │       ├── idle.mp4
│   │       ├── talking.mp4
│   │       ├── alarm.mp4
│   │       └── ...
│   └── package.json
│
├── scripts/
│   └── runall.bat              # Lancement complet
│
├── pages/
│   └── index.html              # Page GitHub Pages
│
└── README.md
```

---

## Lancement

```bash
# Terminal 1 — Backend (à lancer en premier)
cd backend && python main.py

# Terminal 2 — Serveur Node (sert hologramme + télécommande)
cd web_remote && npm start

# Firefox kiosk (hologramme)
firefox --kiosk http://localhost:3000/hologram
```

---

## Licence

Projet personnel — Thomas Lemartinel, 2026.
