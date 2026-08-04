import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readEventStore, refreshEventStore } from "./lib/event-store.js";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const refreshIntervalMs = Number(process.env.REFRESH_INTERVAL_MS || 6 * 60 * 60 * 1000);
const refreshToken = process.env.REFRESH_TOKEN || "";
const publicFiles = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/styles.css", "styles.css"],
  ["/app.js", "app.js"],
  ["/favicon.svg", "favicon.svg"],
  ["/data/events.json", "data/events.json"],
  ["/assets/venues/blue-note-tokyo.jpg", "assets/venues/blue-note-tokyo.jpg"],
  ["/assets/venues/cotton-club.jpg", "assets/venues/cotton-club.jpg"],
  ["/assets/venues/billboard-live-tokyo.webp", "assets/venues/billboard-live-tokyo.webp"],
]);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function isLocalRequest(request) {
  const address = request.socket.remoteAddress || "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

async function serveStatic(request, response, pathname) {
  const relativePath = publicFiles.get(decodeURIComponent(pathname));
  if (!relativePath) {
    sendJson(response, 404, { error: "Not found" });
    return;
  }
  const filePath = path.join(rootDir, relativePath);

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("Not a file");
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "content-type": mimeTypes[extension] || "application/octet-stream",
      "cache-control": extension === ".html" ? "no-cache" : "public, max-age=3600",
    });
    if (request.method === "HEAD") response.end();
    else response.end(await readFile(filePath));
  } catch {
    sendJson(response, 404, { error: "Not found" });
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && url.pathname === "/api/events") {
    sendJson(response, 200, await readEventStore());
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/refresh") {
    const authorization = request.headers.authorization || "";
    const authorized = refreshToken
      ? authorization === `Bearer ${refreshToken}`
      : isLocalRequest(request);

    if (!authorized) {
      sendJson(response, 401, { error: "Unauthorized" });
      return;
    }

    try {
      sendJson(response, 200, await refreshEventStore());
    } catch (error) {
      sendJson(response, 502, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  await serveStatic(request, response, url.pathname);
});

server.listen(port, host, () => {
  console.log(`LIVE SCHEDULE: http://localhost:${port}`);
});

refreshEventStore()
  .then((store) => console.log(`Initial schedule refresh: ${store.events.length} events`))
  .catch((error) => console.error("Initial schedule refresh failed:", error));

const interval = setInterval(() => {
  refreshEventStore()
    .then((store) => console.log(`Scheduled refresh: ${store.events.length} events`))
    .catch((error) => console.error("Scheduled refresh failed:", error));
}, refreshIntervalMs);
interval.unref();
