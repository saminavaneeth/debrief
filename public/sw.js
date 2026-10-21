/* Debrief service worker: offline app shell for the capture app.
 *
 * - Install: fetch every app route, cache its HTML, and cache the /_next/ scripts and styles it
 *   references, so the whole shell works offline after the first visit.
 * - Pages: network first (3.5 s timeout for poor signal), falling back to the cached page. Query
 *   strings are ignored for the fallback, so /scenario?id=<any> uses the cached /scenario shell.
 * - Hashed build assets: cache first. In development (registered with ?dev=1) network first, so
 *   hot reload keeps working.
 * - Demo assets and icons: cache first. API calls: network only (data lives in IndexedDB).
 *
 * Bump VERSION when this file's caching rules change.
 */
const VERSION = "v2";
const SHELL = `debrief-shell-${VERSION}`;
const RUNTIME = `debrief-runtime-${VERSION}`;
const DEV = new URL(self.location.href).searchParams.get("dev") === "1";
const ROUTES = ["/", "/capture", "/inbox", "/scenario", "/process", "/review", "/results", "/records", "/platform", "/console"];
const EXTRA = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"];
const NAV_TIMEOUT_MS = 3500;

const assetUrls = (html) =>
  [...html.matchAll(/(?:src|href)="(\/_next\/[^"]+)"/g)].map((m) => m[1].replaceAll("&amp;", "&"));

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      for (const route of ROUTES) {
        try {
          const res = await fetch(route, { cache: "no-store", credentials: "same-origin" });
          if (!res.ok) continue;
          await cache.put(route, res.clone());
          const assets = assetUrls(await res.text());
          await Promise.all(assets.map((u) => cache.add(u).catch(() => undefined)));
        } catch {
          // Offline during install: pages are cached as they are visited instead.
        }
      }
      await Promise.all(EXTRA.map((u) => cache.add(u).catch(() => undefined)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, RUNTIME]);
      for (const key of await caches.keys()) if (!keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

async function cachedMatch(request, options) {
  return (await caches.match(request, options)) ?? undefined;
}

async function navigation(request) {
  const url = new URL(request.url);
  const key = url.pathname;
  try {
    const res = await withTimeout(fetch(request), NAV_TIMEOUT_MS);
    if (res.ok && (res.headers.get("content-type") ?? "").includes("text/html")) {
      const cache = await caches.open(SHELL);
      await cache.put(key, res.clone());
      // Cache what this page needs, so it also works offline.
      res
        .clone()
        .text()
        .then((html) => Promise.all(assetUrls(html).map((u) => caches.match(u).then((hit) => hit ?? cache.add(u).catch(() => undefined)))));
    }
    return res;
  } catch {
    return (
      (await cachedMatch(key, { ignoreSearch: true })) ??
      (await cachedMatch("/", { ignoreSearch: true })) ??
      new Response("<h1>Offline</h1><p>Open Debrief once while online so it can work offline.</p>", {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      })
    );
  }
}

async function cacheFirst(request) {
  const hit = await cachedMatch(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) (await caches.open(RUNTIME)).put(request, res.clone());
  return res;
}

async function networkFirst(request) {
  try {
    const res = await fetch(request);
    if (res.ok) (await caches.open(RUNTIME)).put(request, res.clone());
    return res;
  } catch {
    return (await cachedMatch(request)) ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // React Server Component payloads for client navigations: network only. When offline the
  // router falls back to a full page load, which the navigation handler serves from cache.
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return;

  if (request.mode === "navigate") {
    event.respondWith(navigation(request));
  } else if (url.pathname.startsWith("/_next/")) {
    event.respondWith(DEV ? networkFirst(request) : cacheFirst(request));
  } else if (url.pathname.startsWith("/demo-assets/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
  } else {
    event.respondWith(networkFirst(request));
  }
});
