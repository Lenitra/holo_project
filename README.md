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
| **Piper**        | Synthèse vocale française neuronale, locale  |
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

- **Voix (TTS)** — Synthèse vocale française 100 % locale, voix au choix (cf. ci-dessous)
- **Spotify** — Recherche de playlists, file d'attente, création de playlists (cf. ci-dessous)
- **Réveil / Scheduler** — Alarmes et routines planifiées, configurable via télécommande, stoppable via bouton physique
- **Audio / Bluetooth** — Lecture audio native, routage vers enceintes BT via bleak
- **Hologramme** — App web pyramide 4 faces, clips vidéo + overlay, piloté par le backend
- **Bouton physique** — Appui court = pause/play, double appui = next, appui long = stop réveil

### Futur

- **Caméra** — Surveillance vidéo via OpenCV, détection de mouvement
- **Domotique** — Appareils connectés (MQTT sera ajouté à ce moment-là)
- **Commande vocale** — Whisper : voix → texte → intent → action

---

## Voix (TTS)

La synthèse vocale tourne **entièrement en local**, en français, via
[Piper](https://github.com/OHF-voice/piper1-gpl) : réseau de neurones ONNX
exécuté sur CPU (temps réel même sur Raspberry Pi). Aucun appel réseau à la
synthèse — seul le téléchargement initial du modèle nécessite une connexion.

- Modèles stockés dans `backend/data/tts/voices/` (non versionnés, ~61 Mo par voix)
- Téléchargés automatiquement au premier démarrage, puis chargés en mémoire
- Voix, débit et volume réglables depuis **Dashboard → Voix de l'assistant**
  de la télécommande, avec bouton d'écoute pour comparer avant de choisir
- Réglages persistés dans `backend/data/settings.json`, clé `tts`
- Repli automatique sur le moteur du système (SAPI5 / espeak-ng) si Piper est
  indisponible, avec sélection explicite d'une voix française

### Voix françaises disponibles

| Voix                 | Description                        |
| -------------------- | ---------------------------------- |
| `fr_FR-siwis-medium` | Femme, naturelle — **par défaut**  |
| `fr_FR-tom-medium`   | Homme, posée                       |
| `fr_FR-upmc-medium`  | Jessica (femme) / Pierre (homme)   |
| `fr_FR-mls-medium`   | 125 locuteurs, qualité variable    |
| `*-low`              | Versions légères, moins naturelles |

### Outils en ligne de commande

```bash
cd backend
uv run python -m modules.tts.cli --list                      # catalogue + état
uv run python -m modules.tts.cli --download fr_FR-tom-medium # pré-télécharger
uv run python -m modules.tts.cli --samples                   # 1 WAV par voix pour comparer
uv run python -m modules.tts.cli --say "Bonjour !"           # test direct
```

**Dépendance système (Linux)** : la lecture audio utilise `paplay`
(PulseAudio/PipeWire) ou `aplay` (`alsa-utils`). Sous Windows, `winsound` suffit.

---

## Spotify

Module basé sur l'**API Web Spotify** (flux OAuth « Authorization Code »).
Depuis la page **Spotify** de la télécommande : rechercher une playlist,
consulter ses titres, les mettre en file d'attente et créer / remplir ses
propres playlists.

### Mise en route

1. Créer une application sur [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Y déclarer l'URL de redirection **exactement** telle qu'elle sera utilisée :
   `https://prism.taumah.fr/api/spotify/callback`
3. Sur la page **Spotify**, saisir Client ID, Client Secret et Redirect URI
   (section « Identifiants de l'application »)
4. Sur la page **Spotify**, cliquer sur *Connecter mon compte* : Spotify redirige
   vers le serveur Node, qui transmet le code au backend. Le refresh token est
   ensuite conservé — l'opération n'est à faire qu'une fois.

Identifiants et jetons sont stockés dans `backend/data/spotify.json`
(hors dépôt Git, permissions `600`). Le Client Secret n'est jamais renvoyé à la
télécommande, seul un indicateur « renseigné » l'est.

### Limites côté Spotify

- Piloter la lecture (file d'attente, play/pause, appareils) exige un compte
  **Premium** et un appareil Spotify Connect actif
- La mise en file est plafonnée à **50 titres** par action (un appel API par titre)
- Une app en mode développement n'accepte que les comptes ajoutés manuellement
  dans le dashboard

### Messages WebSocket

| Message                  | Rôle                                        |
| ------------------------ | ------------------------------------------- |
| `spotify.status`         | État : configuré, connecté, compte, appareil |
| `spotify.set_credentials`| Enregistre Client ID / Secret / Redirect URI |
| `spotify.auth_url`       | URL d'autorisation à ouvrir                  |
| `spotify.search`         | Recherche `playlist` ou `track`              |
| `spotify.playlist`       | Détail d'une playlist + ses titres           |
| `spotify.playlists`      | Mes playlists                                |
| `spotify.playlist_create`| Crée une playlist                            |
| `spotify.playlist_add`   | Ajoute des titres à une playlist             |
| `spotify.queue`          | Met un ou plusieurs titres en file d'attente |
| `spotify.devices` / `set_device` | Appareils Spotify Connect            |
| `spotify.play` / `pause` / `next` | Transport                           |

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
