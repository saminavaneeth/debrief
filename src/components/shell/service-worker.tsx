"use client";

import { useEffect } from "react";

/**
 * Registers `public/sw.js` for offline capture. In development it runs network-first so hot
 * reload keeps working; set NEXT_PUBLIC_DISABLE_SW=1 to turn it off.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NEXT_PUBLIC_DISABLE_SW === "1") return;
    const dev = process.env.NODE_ENV !== "production";
    navigator.serviceWorker
      .register(dev ? "/sw.js?dev=1" : "/sw.js", { scope: "/" })
      .catch((err) => console.warn("Service worker registration failed", err));
  }, []);
  return null;
}
