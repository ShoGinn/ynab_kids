import { createHash, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";
import { fetchBudgetData } from "./lib/ynab.mjs";

const PORT = Math.trunc(Number(process.env.PORT || "3000"));
const SITE_USERNAME = process.env.SITE_USERNAME?.trim() || "family";
const SITE_PASSWORD = process.env.SITE_PASSWORD || "";
const CACHE_TTL_MS =
  Math.max(60, Math.trunc(Number(process.env.CACHE_TTL_SECONDS || "600")) || 600) * 1000;
const STATIC_FILES = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
]);

let cachedBudget = null;
let cacheExpiresAt = 0;
let inFlightFetch = null;

function digest(value) {
  return createHash("sha256").update(value).digest();
}

function isAuthorized(request) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Basic ")) {
    return false;
  }

  try {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) {
      return false;
    }

    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    return (
      timingSafeEqual(digest(username), digest(SITE_USERNAME)) &&
      timingSafeEqual(digest(password), digest(SITE_PASSWORD))
    );
  } catch {
    return false;
  }
}

function setSecurityHeaders(response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

function getBudget() {
  if (cachedBudget && Date.now() < cacheExpiresAt) {
    return cachedBudget;
  }

  if (!inFlightFetch) {
    inFlightFetch = fetchBudgetData()
      .then((budget) => {
        cachedBudget = budget;
        cacheExpiresAt = Date.now() + CACHE_TTL_MS;
        return budget;
      })
      .finally(() => {
        inFlightFetch = null;
      });
  }

  return inFlightFetch;
}

async function serveStatic(request, response, pathname) {
  const entry = STATIC_FILES.get(pathname);
  if (!entry) {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  const [filename, contentType] = entry;
  const filePath = path.join(process.cwd(), filename);
  const fileStat = await stat(filePath);
  response.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": fileStat.size,
  });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
}

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65_535) {
  throw new Error("PORT must be a valid TCP port");
}
if (SITE_PASSWORD.length === 0) {
  throw new Error("SITE_PASSWORD is required");
}

const server = createServer(async (request, response) => {
  setSecurityHeaders(response);
  const method = request.method || "GET";
  const pathname = new URL(request.url || "/", "http://localhost").pathname;

  if (pathname === "/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  if (!isAuthorized(request)) {
    response.setHeader("WWW-Authenticate", 'Basic realm="Kids Budget", charset="UTF-8"');
    sendJson(response, 401, { error: "Authentication required" });
    return;
  }

  if (method !== "GET" && method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  try {
    if (pathname === "/api/budget") {
      const budget = await getBudget();
      if (method === "HEAD") {
        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end();
      } else {
        sendJson(response, 200, budget);
      }
      return;
    }

    await serveStatic(request, response, pathname);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    if (response.headersSent) {
      response.destroy();
    } else {
      sendJson(response, 502, { error: "Unable to load budget data" });
    }
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Kids Budget listening on port ${PORT}`);
});
