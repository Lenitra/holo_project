/**
 * Hologramme — Logique client.
 *
 * Se connecte au backend via WebSocket (sans auth, connexion locale).
 * Gère la machine à états des clips vidéo, l'overlay dynamique
 * et la lecture audio (réveil).
 */

const WS_URL = `ws://${location.host}/ws/hologram`;
const CLIPS_PATH = "/hologram/clips";
const MUSIC_PATH = "/music";

// --- Éléments DOM ---
const videos = document.querySelectorAll(".avatar");
const overlays = document.querySelectorAll(".overlay");

// --- État ---
let currentScreen = "idle";
let ws = null;
let reconnectTimer = null;

// --- Audio (réveil) ---
let alarmAudio = null;

function playMusic(filename) {
  stopMusic();
  alarmAudio = new Audio(`${MUSIC_PATH}/${encodeURIComponent(filename)}`);
  alarmAudio.loop = true;
  alarmAudio.play().catch((e) => console.warn("[holo] Erreur lecture audio :", e));
  console.log("[holo] Audio ▶", filename);
}

function stopMusic() {
  if (alarmAudio) {
    alarmAudio.pause();
    alarmAudio.currentTime = 0;
    alarmAudio.src = "";
    alarmAudio = null;
    console.log("[holo] Audio ■ arrêté");
  }
}

// --- WebSocket ---

function connect() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log("[holo] Connecté au backend");
    clearReconnect();
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleMessage(msg);
    } catch (e) {
      console.warn("[holo] Message invalide :", event.data);
    }
  };

  ws.onclose = () => {
    console.log("[holo] Déconnecté — reconnexion dans 3s");
    scheduleReconnect();
  };

  ws.onerror = () => {
    ws.close();
  };
}

function scheduleReconnect() {
  if (!reconnectTimer) {
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 3000);
  }
}

function clearReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

// --- Gestion des messages ---

function handleMessage(msg) {
  switch (msg.type) {
    case "display.update":
      changeScreen(msg.payload.screen, msg.payload.data);
      break;

    case "display.restart":
      restartVideo();
      break;

    case "display.data":
      updateOverlay(msg.payload);
      break;

    case "identified":
      console.log("[holo] Identifié comme :", msg.payload.id);
      break;

    default:
      console.log("[holo] Message non géré :", msg.type);
  }
}

// --- Machine à états vidéo ---

function changeScreen(screen, data) {
  console.log(`[holo] ${currentScreen} → ${screen}`);
  currentScreen = screen;

  // Arrêter l'audio si on quitte un écran (changement quelconque)
  stopMusic();

  // Écran éteint : tout masquer
  if (screen === "off") {
    videos.forEach((video) => {
      video.pause();
      video.classList.add("fade-out");
      video.classList.remove("fade-in");
    });
    overlays.forEach((el) => { el.innerHTML = ""; });
    return;
  }

  const clipSrc = `${CLIPS_PATH}/${screen}.mp4`;

  // Fade out → change source → fade in (sur les 4 faces)
  videos.forEach((video) => {
    video.classList.add("fade-out");
    video.classList.remove("fade-in");

    setTimeout(() => {
      video.src = clipSrc;
      video.play().catch(() => {});
      video.classList.remove("fade-out");
      video.classList.add("fade-in");
    }, 300);
  });

  // Lancer l'audio si c'est un réveil
  if (data && data.music) {
    playMusic(data.music);
  }

  // Mettre à jour l'overlay ou restaurer l'horloge sur idle
  if (data) {
    updateOverlay(data);
  } else if (screen === "idle") {
    showClock();
  }
}

// --- Overlay dynamique ---

function updateOverlay(data) {
  const html = buildOverlayHTML(data);
  overlays.forEach((el) => {
    el.innerHTML = html;
  });
}

function buildOverlayHTML(data) {
  const parts = [];

  if (data.time) {
    parts.push(`<div class="time">${data.time}</div>`);
  }

  if (data.weather) {
    parts.push(`<div class="info">${data.weather}</div>`);
  }

  if (data.text) {
    parts.push(`<div class="info">${data.text}</div>`);
  }

  return parts.join("");
}

function restartVideo() {
  console.log("[holo] Restart vidéo");
  videos.forEach((video) => {
    video.currentTime = 0;
    video.play().catch(() => {});
  });
}

// --- Horloge par défaut (mise à jour chaque 30 s) ---

function showClock() {
  const now = new Date();
  const time = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  updateOverlay({ time });
}

function startClock() {
  showClock();
  setInterval(() => {
    if (currentScreen === "idle") {
      showClock();
    }
  }, 30_000);
}

// --- Arrêt du réveil par Ctrl gauche ---

document.addEventListener("keydown", (e) => {
  if (e.code === "ControlLeft" && ws && ws.readyState === WebSocket.OPEN) {
    console.log("[holo] Ctrl gauche → alarm.stop");
    ws.send(JSON.stringify({ type: "alarm.stop", payload: {} }));
  }
});

// --- Démarrage (après interaction utilisateur pour débloquer l'audio) ---

document.getElementById("start-btn").addEventListener("click", () => {
  // Débloquer l'autoplay audio avec un son silencieux
  const unlock = new Audio();
  unlock.play().catch(() => {});

  // Cacher l'écran de démarrage, afficher la pyramide
  document.getElementById("start-screen").remove();
  document.querySelector(".pyramid").style.display = "";

  // Lancer l'app
  connect();
  startClock();

  videos.forEach((video) => {
    video.src = `${CLIPS_PATH}/idle.mp4`;
    video.play().catch(() => {});
  });
});
