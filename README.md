# 🔮 Holo_Project

Serveur domestique avec interface holographique — projection lumineuse sur verre affichant un avatar virtuel. Conçu pour tourner sur une seule machine locale, pour un foyer ou un petit bureau (dizaine d'utilisateurs).

---

## Stack technique

- **FastAPI** — backend async, routes montées dynamiquement
- **APScheduler** — cron jobs et réveils
- **OpenCV** — capture et diffusion des flux vidéo
- **SQLite** — stockage léger pour logs, historiques, séries temporelles
- **Fichiers JSON** — config, préférences, alarmes

---

## Architecture modulaire (plug-in)

Chaque fonctionnalité (Spotify, météo, vidéosurveillance...) est un module indépendant héritant de `BaseModule`. Les modules s'enregistrent au démarrage et exposent leurs propres routes FastAPI.

L'activation se gère dans `config.yaml` :

```yaml
modules:
  spotify: true
  weather: true
  surveillance: false
  alarms: true
```

---

## Structure

```
project/
├── modules/            # Un dossier par module
|    |── Core           # Dossier de base pour tous les modules
|    |── Spotify        # Module Spotify
|    |── Weather        # Module météo
|    └── ...
├── data/*.db           # Données du projet, configurations, logs, données des modules
├── media/              # Stockage des vidéos, images, captures
└── main.py
```

---

## Lancer le projet

```bash
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Docs API disponibles sur `http://localhost:8000/docs`.
