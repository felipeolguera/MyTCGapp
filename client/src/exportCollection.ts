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

/** Spreadsheet-ready inventory for buyers / marketplaces. */
export function buildCollectionCsv(rows: ExportRow[]): string {
  const header = [
    "Name",
    "Set",
    "Set Code",
    "Collector Number",
    "Finish",
    "Quantity",
    "Market USD",
    "Line Total USD",
    "TCGPlayer URL",
  ];
  const lines = [header.join(",")];
  for (const { entry, unit, line, url } of rows) {
    lines.push(
      [
        csvEscape(entry.card.name),
        csvEscape(entry.card.setName),
        csvEscape(entry.card.setPrefix),
        csvEscape(entry.card.collectorNumber),
        csvEscape(finishLabel(entry.finish)),
        String(entry.quantity),
        unit != null ? unit.toFixed(2) : "",
        line != null ? line.toFixed(2) : "",
        csvEscape(url ?? ""),
      ].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

/** Human-readable list for Discord / SMS / Notes. */
export function buildCollectionShareText(
  rows: ExportRow[],
  totals: { cards: number; unique: number; market: number; priced: number },
): string {
  const dated = new Date().toISOString().slice(0, 10);
  const lines = [
    `Archive Binder — Grand Archive collection`,
    `Exported ${dated}`,
    `${totals.cards} cards · ${totals.unique} unique · ~${formatUsd(totals.market)} market (${totals.priced}/${totals.unique} priced)`,
    "",
  ];

  for (const { entry, unit, line } of rows) {
    const finish = finishLabel(entry.finish);
    const set = `${entry.card.setPrefix} #${entry.card.collectorNumber}`;
    const priceBits = [
      unit != null ? formatUsd(unit) : null,
      line != null && entry.quantity > 1 ? `line ${formatUsd(line)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    lines.push(
      `• ${entry.card.name} (${finish}) ×${entry.quantity} — ${set}${
        priceBits ? ` — ${priceBits}` : ""
      }`,
    );
  }

  lines.push("", "Prices are TCGPlayer market estimates and may change.");
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
