import { finishLabel, type CollectionEntry } from "./types";
import { formatUsd } from "./prices";

export interface ExportRow {
  entry: CollectionEntry;
  unit: number | null;
  line: number | null;
  url: string | null;
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Display name; foil copies are labeled so buyers can tell finishes apart. */
export function exportCardName(entry: CollectionEntry): string {
  const base = entry.card.name;
  return entry.finish === "foil" ? `${base} (${finishLabel(entry.finish)})` : base;
}

/** Set code + collector number, e.g. ReC-SLM-001 */
export function exportCardCode(entry: CollectionEntry): string {
  const prefix = entry.card.setPrefix.trim() || "GA";
  const num = entry.card.collectorNumber.trim() || "?";
  return `${prefix}-${num}`;
}

/** Spreadsheet inventory: Card name, Code, Unit price, Total quantity, Total price. */
export function buildCollectionCsv(rows: ExportRow[]): string {
  const header = [
    "Card name",
    "Code",
    "Unit price",
    "Total quantity",
    "Total price",
  ];
  const lines = [header.join(",")];
  for (const { entry, unit, line } of rows) {
    lines.push(
      [
        csvEscape(exportCardName(entry)),
        csvEscape(exportCardCode(entry)),
        unit != null ? unit.toFixed(2) : "",
        String(entry.quantity),
        line != null ? line.toFixed(2) : "",
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

/** Human-readable list with the same columns for Discord / SMS / Notes. */
export function buildCollectionShareText(
  rows: ExportRow[],
  totals: { cards: number; unique: number; market: number; priced: number },
): string {
  const dated = new Date().toISOString().slice(0, 10);
  const lines = [
    `Archive Binder — Grand Archive for sale`,
    `Exported ${dated}`,
    `${totals.cards} cards · ~${formatUsd(totals.market)} total`,
    "",
    "Card name | Code | Unit price | Total quantity | Total price",
  ];

  for (const { entry, unit, line } of rows) {
    lines.push(
      [
        exportCardName(entry),
        exportCardCode(entry),
        unit != null ? formatUsd(unit) : "—",
        String(entry.quantity),
        line != null ? formatUsd(line) : "—",
      ].join(" | "),
    );
  }

  return lines.join("\n");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export type ExportResult =
  | { mode: "shared" }
  | { mode: "downloaded" }
  | { mode: "copied" };

/**
 * Prefer native share (list + CSV), else download CSV and copy the text list.
 */
export async function exportCollectionInventory(
  rows: ExportRow[],
  totals: { cards: number; unique: number; market: number; priced: number },
): Promise<ExportResult> {
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `archive-binder-collection-${stamp}.csv`;
  const csv = buildCollectionCsv(rows);
  const text = buildCollectionShareText(rows, totals);
  const csvBlob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const csvFile =
    typeof File !== "undefined"
      ? new File([csvBlob], filename, { type: "text/csv" })
      : null;

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      const payload: ShareData = {
        title: "Grand Archive collection",
        text,
      };
      if (
        csvFile &&
        navigator.canShare &&
        navigator.canShare({ files: [csvFile] })
      ) {
        payload.files = [csvFile];
      }
      await navigator.share(payload);
      return { mode: "shared" };
    } catch (err) {
      // User cancel should not fall through to download spam.
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err;
      }
    }
  }

  downloadBlob(csvBlob, filename);

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return { mode: "copied" };
    }
  } catch {
    // Clipboard may be blocked; CSV download still succeeded.
  }

  return { mode: "downloaded" };
}
