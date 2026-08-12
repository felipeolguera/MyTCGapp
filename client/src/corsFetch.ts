import { Capacitor, CapacitorHttp } from "@capacitor/core";

/**
 * JSON GET that works in Capacitor Android/iOS (bypasses WebView CORS)
 * and in the browser via same-origin proxy when needed.
 */
export async function fetchJsonBypassingCors<T>(url: string): Promise<T> {
  try {
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.get({
        url,
        headers: { Accept: "application/json" },
      });
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`Request failed (${res.status}) for ${url}`);
      }
      if (typeof res.data === "string") {
        return JSON.parse(res.data) as T;
      }
      return res.data as T;
    }

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Request failed (${res.status}) for ${url}`);
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(
        "Could not reach price feed (network blocked). On web, use the Vite/API proxy; on APK ensure data is on.",
      );
    }
    throw err;
  }
}

/** Base URL for TCGCSV — proxied in browser, absolute on native. */
export function tcgcsvBaseUrl(): string {
  if (Capacitor.isNativePlatform()) {
    return "https://tcgcsv.com";
  }
  // Vite/dev and any same-origin reverse proxy.
  if (import.meta.env.DEV || import.meta.env.VITE_STANDALONE !== "true") {
    return "/tcgcsv";
  }
  // Standalone web preview without proxy — will likely hit CORS.
  return "https://tcgcsv.com";
}
