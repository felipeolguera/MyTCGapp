import { normalizeAskingPrice } from "./types";

/** Apply market × percent (e.g. 90 → 90% of market), rounded to cents. */
export function marketTimesPercent(
  market: number | null | undefined,
  percent: number,
): number | null {
  if (market == null || !Number.isFinite(market) || market < 0) return null;
  if (!Number.isFinite(percent) || percent < 0) return null;
  return normalizeAskingPrice((market * percent) / 100);
}

export function parseAskPercent(raw: string): number | null {
  const n = Number(String(raw).trim().replace(/%/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > 500) return null;
  return n;
}
