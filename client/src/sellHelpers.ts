import { formatUsd } from "./prices";
import type { CollectionListRow } from "./collectionQuery";
import { exportQuantity } from "./exportCollection";

/** Sum of (asking ?? market) × qty for the current view. */
export function sumAskingTotal(rows: CollectionListRow[]): number {
  return rows.reduce((sum, row) => {
    const unit = row.entry.askingPrice ?? row.unit;
    if (unit == null) return sum;
    return sum + unit * row.entry.quantity;
  }, 0);
}

export function countPricedLines(rows: CollectionListRow[]): number {
  return rows.filter((row) => (row.entry.askingPrice ?? row.unit) != null).length;
}

/** One-line paste for Discord / Marketplace listings. */
export function buildAskingTotalClipboard(rows: CollectionListRow[]): string {
  const cards = rows.reduce((n, r) => n + r.entry.quantity, 0);
  const total = sumAskingTotal(rows);
  const priced = countPricedLines(rows);
  return `Grand Archive for sale — ${exportQuantity(cards)} · ${rows.length} lines · ${formatUsd(total)} total (${priced}/${rows.length} priced)`;
}

export async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error("Clipboard unavailable on this device");
  }
  await navigator.clipboard.writeText(text);
}
