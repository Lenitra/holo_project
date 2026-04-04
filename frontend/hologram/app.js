/**
 * Hologramme — Logique client.
 *
 * Se connecte au backend via WebSocket (sans auth, connexion locale).
 * Gère la machine à états des clips vidéo et l'overlay dynamique.
 */

const WS_URL = `ws://${location.host}/ws/hologram`;
const CLIPS_PATH = "/hologram/clips";

// --- Éléments DOM ---
const videos = document.querySelectorAll(".avatar");
const overlays = document.querySelectorAll(".overlay");

// --- État ---
let currentScreen = "idle";
let ws = null;
let reconnectTimer = null;

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

// --- Démarrage ---

connect();
startClock();

// Charger le clip idle par défaut si disponible
videos.forEach((video) => {
  video.src = `${CLIPS_PATH}/idle.mp4`;
  video.play().catch(() => {});
});
