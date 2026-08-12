import type { CardFinish, CollectionEntry } from "./types";
import { finishLabel } from "./types";
import { formatUsd } from "./prices";

const SETTINGS_KEY = "archive-binder.price-alerts.settings.v1";
const SNAPSHOT_KEY = "archive-binder.price-alerts.snapshot.v1";
const MOVERS_KEY = "archive-binder.price-alerts.movers.v1";

export const DEFAULT_ALERT_THRESHOLD = 15;

export interface PriceAlertSettings {
  /** Absolute % move vs last snapshot that triggers an alert. */
  thresholdPercent: number;
}

export interface PriceSnapshotEntry {
  entryId: string;
  name: string;
  finish: CardFinish;
  market: number;
}

export interface PriceSnapshot {
  capturedAt: string;
  entries: Record<string, PriceSnapshotEntry>;
}

export interface PriceMover {
  entryId: string;
  name: string;
  finish: CardFinish;
  previous: number;
  current: number;
  /** Signed percent change, e.g. +18.5 or -22.0 */
  changePercent: number;
}

export interface PricedOwnedRow {
  entry: CollectionEntry;
  market: number | null;
}

export function readAlertSettings(): PriceAlertSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { thresholdPercent: DEFAULT_ALERT_THRESHOLD };
    const parsed = JSON.parse(raw) as Partial<PriceAlertSettings>;
    const n = Number(parsed.thresholdPercent);
    return {
      thresholdPercent:
        Number.isFinite(n) && n > 0 && n <= 500
          ? n
          : DEFAULT_ALERT_THRESHOLD,
    };
  } catch {
    return { thresholdPercent: DEFAULT_ALERT_THRESHOLD };
  }
}

export function writeAlertSettings(settings: PriceAlertSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function readPriceSnapshot(): PriceSnapshot | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PriceSnapshot;
    if (!parsed?.entries || typeof parsed.entries !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writePriceSnapshot(snapshot: PriceSnapshot): void {
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
}

export function readMovers(): PriceMover[] {
  try {
    const raw = localStorage.getItem(MOVERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PriceMover[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeMovers(movers: PriceMover[]): void {
  localStorage.setItem(MOVERS_KEY, JSON.stringify(movers));
}

export function clearMovers(): void {
  localStorage.removeItem(MOVERS_KEY);
}

export function buildPriceSnapshot(
  rows: PricedOwnedRow[],
  at = new Date().toISOString(),
): PriceSnapshot {
  const entries: Record<string, PriceSnapshotEntry> = {};
  for (const { entry, market } of rows) {
    if (market == null || !(market > 0)) continue;
    entries[entry.id] = {
      entryId: entry.id,
      name: entry.card.name,
      finish: entry.finish,
      market,
    };
  }
  return { capturedAt: at, entries };
}

/**
 * Compare current owned markets to the last snapshot.
 * Only includes lines that exist in both with positive markets.
 */
export function computePriceMovers(
  rows: PricedOwnedRow[],
  snapshot: PriceSnapshot | null,
  thresholdPercent: number,
): PriceMover[] {
  if (!snapshot || thresholdPercent <= 0) return [];
  const movers: PriceMover[] = [];
  for (const { entry, market } of rows) {
    if (market == null || !(market > 0)) continue;
    const prev = snapshot.entries[entry.id];
    if (!prev || !(prev.market > 0)) continue;
    const changePercent =
      ((market - prev.market) / prev.market) * 100;
    if (Math.abs(changePercent) + 1e-9 < thresholdPercent) continue;
    movers.push({
      entryId: entry.id,
      name: entry.card.name,
      finish: entry.finish,
      previous: prev.market,
      current: market,
      changePercent: Math.round(changePercent * 10) / 10,
    });
  }
  movers.sort(
    (a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent),
  );
  return movers;
}

/**
 * After a price refresh: compare to prior snapshot, persist movers, then
 * advance the snapshot to the new markets (baseline for next refresh).
 */
export function evaluatePriceAlerts(
  rows: PricedOwnedRow[],
  thresholdPercent: number,
): { movers: PriceMover[]; snapshot: PriceSnapshot; firstBaseline: boolean } {
  const prior = readPriceSnapshot();
  const snapshot = buildPriceSnapshot(rows);
  if (!prior || Object.keys(prior.entries).length === 0) {
    writePriceSnapshot(snapshot);
    clearMovers();
    return { movers: [], snapshot, firstBaseline: true };
  }
  const movers = computePriceMovers(rows, prior, thresholdPercent);
  writeMovers(movers);
  writePriceSnapshot(snapshot);
  return { movers, snapshot, firstBaseline: false };
}

export function formatMoverLine(mover: PriceMover): string {
  const sign = mover.changePercent > 0 ? "+" : "";
  return `${mover.name} (${finishLabel(mover.finish)}) ${sign}${mover.changePercent}% · ${formatUsd(mover.previous)} → ${formatUsd(mover.current)}`;
}

export function formatMoversSummary(movers: PriceMover[]): string {
  if (movers.length === 0) return "No price alerts";
  const up = movers.filter((m) => m.changePercent > 0).length;
  const down = movers.length - up;
  return `${movers.length} mover${movers.length === 1 ? "" : "s"} · ${up}↑ ${down}↓`;
}
