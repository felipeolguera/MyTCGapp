import type { CardCondition, CardFinish, GaCardEdition } from "./types";
import { formatUsd } from "./prices";

const LEDGER_KEY = "archive-binder.sales-ledger.v1";
const MAX_RECORDS = 200;

export interface SaleLine {
  entryId: string;
  name: string;
  finish: CardFinish;
  condition: CardCondition;
  setCode: string;
  quantity: number;
  unitPrice: number | null;
  /** Snapshot for undo restore (optional on older ledger rows). */
  card?: GaCardEdition;
  forSale?: boolean;
  askingPrice?: number | null;
  note?: string;
}

export interface SaleRecord {
  id: string;
  soldAt: string;
  lines: SaleLine[];
  total: number;
  cardCount: number;
  /** How qty changed: full stack vs −1 style. */
  mode: "checkout" | "sold-one";
}

export function readSalesLedger(): SaleRecord[] {
  try {
    const raw = localStorage.getItem(LEDGER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SaleRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSalesLedger(records: SaleRecord[]): void {
  localStorage.setItem(
    LEDGER_KEY,
    JSON.stringify(records.slice(0, MAX_RECORDS)),
  );
}

export function recordSale(
  lines: SaleLine[],
  mode: SaleRecord["mode"],
  at = new Date().toISOString(),
): SaleRecord {
  const cardCount = lines.reduce((n, l) => n + l.quantity, 0);
  const total = lines.reduce((sum, l) => {
    if (l.unitPrice == null) return sum;
    return sum + l.unitPrice * l.quantity;
  }, 0);
  const record: SaleRecord = {
    id: `sale-${at}-${Math.random().toString(36).slice(2, 8)}`,
    soldAt: at,
    lines,
    total,
    cardCount,
    mode,
  };
  const next = [record, ...readSalesLedger()].slice(0, MAX_RECORDS);
  writeSalesLedger(next);
  return record;
}

export function peekLastSale(): SaleRecord | null {
  return readSalesLedger()[0] ?? null;
}

/** Remove and return the most recent sale (for undo). */
export function popLastSale(): SaleRecord | null {
  const records = readSalesLedger();
  if (records.length === 0) return null;
  const [last, ...rest] = records;
  writeSalesLedger(rest);
  return last;
}

export function clearSalesLedger(): void {
  localStorage.removeItem(LEDGER_KEY);
}

/** True when every line has a card snapshot to restore. */
export function canUndoSale(record: SaleRecord): boolean {
  return record.lines.length > 0 && record.lines.every((l) => Boolean(l.card));
}

/** Revenue for sales on the local calendar day of `now`. */
export function sessionRevenue(
  records: SaleRecord[],
  now = new Date(),
): { total: number; cards: number; sales: number } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();
  let total = 0;
  let cards = 0;
  let sales = 0;
  for (const row of records) {
    const t = Date.parse(row.soldAt);
    if (!Number.isFinite(t) || t < startMs) continue;
    total += row.total;
    cards += row.cardCount;
    sales += 1;
  }
  return { total, cards, sales };
}

export function formatLedgerSummary(
  records: SaleRecord[],
  now = new Date(),
): string {
  const { total, cards, sales } = sessionRevenue(records, now);
  if (sales === 0) return "No sales today";
  return `Today ${sales} sale${sales === 1 ? "" : "s"} · ${cards} cards · ${formatUsd(total)}`;
}

export function buildSaleReceipt(record: SaleRecord): string {
  const lines = record.lines.map((l) => {
    const price =
      l.unitPrice != null ? formatUsd(l.unitPrice * l.quantity) : "—";
    const finish = l.finish === "foil" ? "(F)" : "(N)";
    return `${l.name} ${finish} ${l.condition} · ${l.setCode} · ×${l.quantity} · ${price}`;
  });
  return [
    `Archive Binder receipt · ${record.cardCount} cards · ${formatUsd(record.total)}`,
    ...lines,
  ].join("\n");
}
