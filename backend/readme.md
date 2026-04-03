# Backend — Doc technique

Cerveau du système. Process Python asyncio qui orchestre toute la logique métier, expose un serveur WebSocket central et gère les modules.

---

## Jalon 0 — Fondations

Socle technique sur lequel tout le reste repose. Rien ne fonctionne sans ça.

- [ ] **Point d'entrée asyncio** (`main.py`) — Boucle événementielle principale, lance tous les services via `asyncio.gather`
- [ ] **Serveur WebSocket** (`ws_server.py`) — Écoute sur `localhost:8765`, gère les connexions/déconnexions, identifie les clients (`hologram`, `remote`) à la connexion
- [ ] **Protocole de messages** — Format JSON uniforme `{ "type": "...", "payload": {...} }`, parsing, validation, routing vers le bon handler selon le `type`
- [ ] **Event bus interne** — Système pub/sub en mémoire pour découpler les modules entre eux (un module publie un événement, les autres s'y abonnent)
- [ ] **Configuration** (`config.yaml`) — Chargement de la config au démarrage (ports, chemins, paramètres modules)
- [ ] **Logging** — Logger structuré avec niveaux (debug/info/warning/error), rotation des fichiers de log

**Critère de validation** : le backend démarre, accepte une connexion WebSocket, reçoit un message JSON et le log.

---

## Jalon 1 — Persistance & Scheduler

Base de données et planification : les deux piliers pour gérer des alarmes et des préférences.

- [ ] **SQLite wrapper** (`database.py`) — Connexion async (via `aiosqlite`), création auto des tables au premier lancement, méthodes CRUD génériques
- [ ] **Schéma initial** — Tables : `alarms` (id, time, days, enabled, sound), `config` (key, value), `history` (event, timestamp)
- [ ] **Scheduler** (`scheduler.py`) — Wrapper autour d'APScheduler, chargement des alarmes depuis SQLite au démarrage, ajout/suppression dynamique de jobs
- [ ] **Lien Scheduler → Event bus** — Quand une alarme se déclenche, le scheduler publie un événement `alarm.triggered` sur le bus

**Critère de validation** : une alarme enregistrée en base se déclenche à l'heure prévue et publie un événement sur le bus.

---

## Jalon 2 — Communication hologramme

Le backend peut piloter l'affichage de l'hologramme à distance.

- [ ] **Routing des messages vers l'hologramme** — Le backend peut envoyer un message ciblé au client identifié comme `hologram`
- [ ] **Messages display** — Implémentation des types : `display.update` (changer d'écran), `display.data` (mettre à jour les données d'un écran)
- [ ] **Gestion de la déconnexion** — Détection de la perte de connexion de l'hologramme, tentative de re-routage, log d'alerte
- [ ] **Heartbeat** — Ping/pong périodique pour vérifier que l'hologramme est toujours connecté

**Critère de validation** : le backend envoie `display.update` → l'hologramme (ou un client WS de test) reçoit le message avec le bon payload.

---

## Jalon 3 — Module Audio / Bluetooth

Lecture audio et routage vers les enceintes Bluetooth.

- [ ] **Module audio** (`modules/audio/`) — Lecture de fichiers audio (MP3/WAV) via une lib async-compatible
- [ ] **Contrôle du volume** — Volume progressif (fade-in), mute, set volume absolu
- [ ] **Scan & connexion Bluetooth** (`bleak`) — Découverte des enceintes BT à portée, appairage, reconnexion auto
- [ ] **Routage audio → BT** — Rediriger la sortie audio vers l'enceinte Bluetooth connectée
- [ ] **Commandes via event bus** — Écoute des événements `audio.play`, `audio.stop`, `audio.volume` publiés par d'autres modules

**Critère de validation** : l'événement `alarm.triggered` déclenche une lecture audio avec fade-in sur l'enceinte BT.

---

## Jalon 4 — Module Réveil (workflow complet)

Premier workflow de bout en bout : alarme → audio + hologramme → arrêt via bouton.

- [ ] **Orchestrateur de réveil** — Écoute `alarm.triggered`, coordonne : démarrage audio (fade-in) + envoi `display.update` (écran alarm) à l'hologramme
- [ ] **Données de l'écran réveil** — Récupérer et envoyer : heure actuelle, météo (API externe), prochains événements
- [ ] **Snooze** — Appui court sur bouton → met en pause l'audio, relance dans X minutes
- [ ] **Stop réveil** — Appui long sur bouton → coupe l'audio, envoie `display.update` (écran idle) à l'hologramme
- [ ] **CRUD alarmes via télécommande** — Réception des messages WS `alarm.create`, `alarm.update`, `alarm.delete` depuis le client `remote`, persistance en base

**Critère de validation** : un réveil se déclenche à l'heure, joue de l'audio, affiche l'écran alarm sur l'hologramme, et un appui long coupe tout.

---

## Jalon 5 — Module Bouton physique

Gestion du bouton hardware connecté au laptop.

- [ ] **Lecture du bouton** (`modules/button/`) — Écoute GPIO ou USB/evdev en async, debounce matériel
- [ ] **Détection des gestes** — Appui court (<300ms), double appui (<600ms entre deux), appui long (>1s)
- [ ] **Publication sur le bus** — `button.short_press`, `button.double_press`, `button.long_press`
- [ ] **Mapping configurable** — Associer chaque geste à une action dans `config.yaml` (ex: `long_press → alarm.stop`)

**Critère de validation** : un appui long physique sur le bouton publie `button.long_press` → le module réveil reçoit l'événement et coupe tout.

---

## Jalon 6 — Communication télécommande

Interface complète entre le backend et la PWA React.

- [ ] **Routing des messages vers la télécommande** — Envoi ciblé au client identifié comme `remote`
- [ ] **État initial** — À la connexion de la télécommande, envoyer un snapshot de l'état courant (alarmes, config, statut audio, statut hologramme)
- [ ] **Sync temps réel** — Quand l'état change côté backend, push automatique vers la télécommande
- [ ] **Gestion multi-clients** — Supporter plusieurs télécommandes connectées simultanément (broadcast)

**Critère de validation** : la télécommande se connecte, reçoit l'état courant, et voit en temps réel les changements (ex: alarme qui se déclenche).

---

## Jalons futurs

Ces modules seront implémentés après la V1 :

| Module | Dépendances | Notes |
|--------|-------------|-------|
| Spotify | Audio, Télécommande | API Spotify Connect, OAuth |
| Caméra | Event bus | OpenCV, détection de mouvement |
| Domotique | Event bus, Télécommande | MQTT, appareils connectés |
| Commande vocale | Audio, Event bus | Whisper, intent parsing |

---

## Dépendances Python

```
websockets
aiosqlite
apscheduler
bleak
pyyaml
```
