# Home Assistant Custom

Assistant domestique custom développé en Python, tournant sur un laptop dédié avec affichage holographique, télécommande PWA et bouton physique.

---

## Architecture

Le système repose sur **un seul process Python** qui combine le backend (logique métier) et le rendu holographique (Pygame). La télécommande PWA sert uniquement à la configuration. Un bouton physique sur le boîtier gère les actions rapides.

```
┌──────────────────────────────────────────┐
│  Laptop dédié — Process Python unique    │
│                                          │
│  [Backend]           [Hologramme]        │
│   Logique métier      Rendu Pygame       │
│   Scheduler           (passif)           │
│   Modules                                │
│                                          │
│  [Serveur WebSocket :8765]               │
└──────────────────────────────────────────┘
        │                       │
        ▼                       ▼
 [Télécommande PWA]     [Bouton physique]
  Configuration          Stop / Pause / Next
```

**Principe fondamental** : le backend est le cerveau unique. Il décide de tout — les frontends ne font qu'afficher et transmettre.

---

## Stack technique

### Backend + Hologramme (process unifié)

| Technologie | Rôle |
|---|---|
| **Python 3.11+** | Langage principal |
| **asyncio** | Orchestration async — rendu, WebSocket, scheduler et modules dans un seul process |
| **Pygame** | Rendu graphique plein écran de l'hologramme |
| **websockets** | Serveur WebSocket async pour la télécommande |
| **APScheduler** | Planification des réveils et routines |
| **SQLite** | Persistance locale (configs, historique, préférences) |
| **bleak** | Gestion async du Bluetooth (enceintes) |
| **GPIO / evdev** | Lecture du bouton physique |

### Télécommande PWA

| Technologie | Rôle |
|---|---|
| **React** | Interface de configuration |
| **WebSocket natif** | Communication bidirectionnelle avec le backend |
| **PWA manifest** | Installation optionnelle sur mobile, cache offline |

---

## Communication

| Liaison | Protocole |
|---|---|
| Backend ↔ Hologramme | Event bus asyncio (même process, en mémoire) |
| Backend ↔ Télécommande | WebSocket sur port 8765 |
| Backend ↔ Bouton physique | GPIO / USB / evdev |
| Accès distant | Cloudflare Tunnel (pas d'IP fixe requise) |

---

## Modules

### V1

- **Réveil / Scheduler** — Alarmes et routines planifiées, configurable via télécommande, stoppable via bouton physique
- **Audio / Bluetooth** — Lecture audio native, routage vers enceintes BT via bleak
- **Hologramme** — Rendu passif Pygame, reçoit les commandes d'affichage du backend
- **Bouton physique** — Appui court = pause/play, double appui = next, appui long = stop réveil

### Futur

- **Spotify** — Contrôle via API Spotify Connect
- **Caméra** — Surveillance vidéo via OpenCV, détection de mouvement
- **Domotique** — Appareils connectés (MQTT sera ajouté à ce moment-là)
- **Commande vocale** — Whisper : voix → texte → intent → action

---

## Exemple de flux : le réveil

1. **7h30** — Le scheduler détecte l'heure du réveil
2. **Backend** — Lance l'audio vers les enceintes Bluetooth (volume progressif)
3. **Hologramme** — Affiche l'écran réveil (heure, météo, agenda)
4. **Bouton** — L'utilisateur fait un appui long → événement `button.long_press`
5. **Backend** — Coupe l'audio, remet l'hologramme en mode normal

---

## Structure du projet

```
home-assistant/
├── core/
│   ├── main.py              # Point d'entrée
│   ├── event_bus.py          # Bus d'événements asyncio
│   └── scheduler.py          # APScheduler wrapper
├── modules/
│   ├── audio/                # Lecture audio + Bluetooth
│   ├── display/              # Rendu Pygame (hologramme)
│   ├── button/               # Lecture bouton physique
│   ├── spotify/              # (futur)
│   ├── camera/               # (futur)
│   └── voice/                # (futur)
├── api/
│   └── ws_server.py          # Serveur WebSocket
├── db/
│   └── database.py           # SQLite wrapper
├── remote/                   # Télécommande PWA (React)
│   ├── src/
│   └── public/
├── config.yaml               # Configuration générale
├── requirements.txt
└── README.md
```

---

## Installation

```bash
# Cloner le projet
git clone https://github.com/user/home-assistant.git
cd home-assistant

# Installer les dépendances Python
pip install -r requirements.txt

# Lancer le système
python core/main.py
```

### Télécommande PWA

```bash
cd remote
npm install
npm run build
# Les fichiers statiques sont servis par le backend WebSocket
```

### Accès distant

```bash
# Installer cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared

# Créer le tunnel
./cloudflared tunnel --url ws://localhost:8765
```

---

## Configuration

Le fichier `config.yaml` centralise tous les réglages :

```yaml
display:
  fullscreen: true
  resolution: [1920, 1080]
  fps: 30

audio:
  bluetooth_device: "JBL Flip 6"
  volume_default: 50
  volume_alarm_max: 80
  volume_step_seconds: 30

alarm:
  default_sound: "sunrise.wav"
  snooze_minutes: 9

button:
  type: "usb"  # gpio | usb | keyboard
  short_press: "audio.toggle"
  double_press: "audio.next"
  long_press: "alarm.stop"

websocket:
  port: 8765
  host: "0.0.0.0"
```

---

## Licence

Projet personnel — Thomas Lemartinel, 2026.