/**
 * Serveur Node de la télécommande.
 *
 * Responsabilités :
 * 1. Servir la SPA React et l'hologramme (fichiers statiques)
 * 2. Authentifier les utilisateurs via PIN → JWT
 * 3. Proxy WebSocket authentifié vers le backend (localhost:8765)
 *
 * Architecture :
 *   [Mobile] → HTTPS (Cloudflare Tunnel) → [Node :3000] → WS → [Backend :8765]
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

import express from "express";
import jwt from "jsonwebtoken";
import multer from "multer";
import fs from "fs";
import { WebSocketServer, WebSocket } from "ws";
import http from "http";

// ---------------------------------------------------------------------------
// Configuration (tout vient du .env racine)
// ---------------------------------------------------------------------------

const WS_HOST = process.env.WS_HOST || "localhost";
const WS_PORT = process.env.WS_PORT || "8765";
const PORT = parseInt(process.env.NODE_PORT || "3000");
const BACKEND_WS_URL = `ws://${WS_HOST}:${WS_PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
const JWT_EXPIRY = process.env.JWT_EXPIRY || "90d";
const PIN = process.env.PIN || "1234";

const MAX_PIN_ATTEMPTS = 5;
const PIN_WINDOW_MS = 15 * 60 * 1000;
const pinAttempts = new Map<string, { count: number; resetAt: number }>();

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();

app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (_req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

app.use(express.json());

// --- Auth API ---

app.post("/api/auth", (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const record = pinAttempts.get(ip);

  if (record) {
    if (now > record.resetAt) { pinAttempts.delete(ip); }
    else if (record.count >= MAX_PIN_ATTEMPTS) {
      const retryIn = Math.ceil((record.resetAt - now) / 1000);
      res.status(429).json({ error: `Trop de tentatives. Réessayez dans ${retryIn}s.` });
      return;
    }
  }

  const { pin } = req.body;
  if (!pin || pin !== PIN) {
    const current = pinAttempts.get(ip) || { count: 0, resetAt: now + PIN_WINDOW_MS };
    current.count++;
    pinAttempts.set(ip, current);
    console.warn(`[auth] PIN incorrect depuis ${ip} (${current.count}/${MAX_PIN_ATTEMPTS})`);
    res.status(401).json({ error: "PIN incorrect" });
    return;
  }

  pinAttempts.delete(ip);
  const token = jwt.sign({ role: "remote" }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
  console.log(`[auth] Authentification réussie depuis ${ip}`);
  res.json({ token });
});

app.get("/api/auth/verify", (req, res) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) { res.status(401).json({ valid: false }); return; }
  try { jwt.verify(token, JWT_SECRET); res.json({ valid: true }); }
  catch { res.status(401).json({ valid: false }); }
});

// --- Settings API (city config) ---

const SETTINGS_PATH = path.join(__dirname, "..", "backend", "data", "settings.json");

function readSettings(): Record<string, unknown> {
  try {
    if (fs.existsSync(SETTINGS_PATH)) return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
  } catch {}
  return {};
}

function writeSettings(settings: Record<string, unknown>) {
  const dir = path.dirname(SETTINGS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
}

app.get("/api/settings/city", (_req, res) => {
  const settings = readSettings();
  res.json(settings.city || { name: "Toulouse", latitude: 43.6047, longitude: 1.4442 });
});

app.post("/api/settings/city", (req, res) => {
  const { name, latitude, longitude } = req.body;
  if (!name || latitude == null || longitude == null) {
    res.status(400).json({ error: "Champs requis : name, latitude, longitude" });
    return;
  }
  const settings = readSettings();
  settings.city = { name, latitude: Number(latitude), longitude: Number(longitude) };
  writeSettings(settings);
  res.json(settings.city);
});

// --- Music API (upload / list / delete) ---

const MUSIC_DIR = path.join(__dirname, "..", "backend", "data", "music");

// S'assurer que le dossier existe
if (!fs.existsSync(MUSIC_DIR)) fs.mkdirSync(MUSIC_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, MUSIC_DIR),
    filename: (_req, file, cb) => {
      // Garder le nom original, nettoyé
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      cb(null, safe);
    },
  }),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "audio/mpeg" || file.originalname.endsWith(".mp3")) {
      cb(null, true);
    } else {
      cb(new Error("Seuls les fichiers MP3 sont acceptés"));
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 Mo max
});

app.get("/api/music", (_req, res) => {
  try {
    const files = fs.readdirSync(MUSIC_DIR)
      .filter((f: string) => f.endsWith(".mp3"))
      .map((f: string) => {
        const stat = fs.statSync(path.join(MUSIC_DIR, f));
        return { name: f, size: stat.size };
      });
    res.json({ files });
  } catch {
    res.json({ files: [] });
  }
});

app.post("/api/music/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Aucun fichier reçu" });
    return;
  }
  res.json({ name: req.file.filename, size: req.file.size });
});

app.delete("/api/music/:name", (req, res) => {
  const filepath = path.join(MUSIC_DIR, req.params.name);
  if (!fs.existsSync(filepath)) {
    res.status(404).json({ error: "Fichier introuvable" });
    return;
  }
  fs.unlinkSync(filepath);
  res.json({ deleted: req.params.name });
});

// --- Fichiers statiques ---

app.use("/hologram", express.static(path.join(__dirname, "hologram")));
app.use("/music", express.static(MUSIC_DIR));
app.use(express.static(path.join(__dirname, "dist")));

app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// ---------------------------------------------------------------------------
// HTTP server + WebSocket (mode noServer pour éviter le conflit avec Express)
// ---------------------------------------------------------------------------

const httpServer = http.createServer(app);

const wssRemote = new WebSocketServer({ noServer: true });
const wssHolo = new WebSocketServer({ noServer: true });

// Gérer l'upgrade HTTP → WebSocket manuellement
httpServer.on("upgrade", (req, socket, head) => {
  const { pathname } = new URL(req.url || "", `http://${req.headers.host}`);

  if (pathname === "/ws") {
    wssRemote.handleUpgrade(req, socket, head, (ws) => {
      wssRemote.emit("connection", ws, req);
    });
  } else if (pathname === "/ws/hologram") {
    wssHolo.handleUpgrade(req, socket, head, (ws) => {
      wssHolo.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

// --- WS Remote (avec auth JWT) ---

wssRemote.on("connection", (clientWs, req) => {
  const ip = req.socket.remoteAddress || "unknown";
  console.log(`[ws] Nouvelle connexion depuis ${ip}`);

  let backendWs: WebSocket | null = null;
  let authenticated = false;

  const authTimeout = setTimeout(() => {
    if (!authenticated) {
      console.warn(`[ws] Timeout auth pour ${ip}`);
      clientWs.close(4001, "Auth timeout");
    }
  }, 10_000);

  clientWs.on("message", (data) => {
    const raw = data.toString();

    if (!authenticated) {
      try {
        const msg = JSON.parse(raw);
        if (msg.type !== "auth" || !msg.payload?.token) {
          clientWs.send(JSON.stringify({ type: "error", payload: { message: "Premier message doit être de type 'auth'" } }));
          return;
        }

        jwt.verify(msg.payload.token, JWT_SECRET);
        authenticated = true;
        clearTimeout(authTimeout);
        console.log(`[ws] Client authentifié : ${ip}`);

        backendWs = new WebSocket(BACKEND_WS_URL);

        backendWs.on("open", () => {
          console.log(`[ws] Connecté au backend pour ${ip}`);
          backendWs!.send(JSON.stringify({ type: "identify", payload: { role: "remote" } }));
          clientWs.send(JSON.stringify({ type: "authenticated", payload: { message: "Connexion établie" } }));
        });

        backendWs.on("message", (d) => { if (clientWs.readyState === WebSocket.OPEN) clientWs.send(d.toString()); });
        backendWs.on("close", () => { clientWs.close(4002, "Backend disconnected"); });
        backendWs.on("error", (err) => { console.error(`[ws] Erreur backend :`, err.message); clientWs.close(); });
      } catch (err) {
        console.warn(`[ws] Auth échouée pour ${ip} :`, (err as Error).message);
        clientWs.send(JSON.stringify({ type: "error", payload: { message: "Token invalide ou expiré" } }));
        clientWs.close(4000, "Invalid token");
      }
      return;
    }

    if (backendWs && backendWs.readyState === WebSocket.OPEN) backendWs.send(raw);
  });

  clientWs.on("close", () => {
    clearTimeout(authTimeout);
    console.log(`[ws] Client déconnecté : ${ip}`);
    if (backendWs && backendWs.readyState === WebSocket.OPEN) backendWs.close();
  });
});

// --- WS Hologramme (sans auth, local) ---

wssHolo.on("connection", (clientWs) => {
  console.log("[holo-ws] Hologramme connecté");
  const backendWs = new WebSocket(BACKEND_WS_URL);

  backendWs.on("open", () => {
    backendWs.send(JSON.stringify({ type: "identify", payload: { role: "hologram" } }));
    console.log("[holo-ws] Connecté au backend");
  });

  backendWs.on("message", (d) => { if (clientWs.readyState === WebSocket.OPEN) clientWs.send(d.toString()); });
  clientWs.on("message", (d) => { if (backendWs.readyState === WebSocket.OPEN) backendWs.send(d.toString()); });
  backendWs.on("close", () => clientWs.close(4002, "Backend disconnected"));
  backendWs.on("error", (err) => { console.error("[holo-ws] Erreur :", err.message); clientWs.close(); });
  clientWs.on("close", () => { if (backendWs.readyState === WebSocket.OPEN) backendWs.close(); });
});

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------

httpServer.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║  Web Remote démarré                  ║`);
  console.log(`║  HTTP  → http://localhost:${PORT}       ║`);
  console.log(`║  WS    → ws://localhost:${PORT}/ws      ║`);
  console.log(`║  Holo  → ws://localhost:${PORT}/ws/hologram ║`);
  console.log(`║  Proxy → ${BACKEND_WS_URL}   ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
});
