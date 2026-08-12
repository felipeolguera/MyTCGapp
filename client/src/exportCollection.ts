import { finishLabel, type CollectionEntry } from "./types";
import { formatUsd } from "./prices";

export interface ExportRow {
  entry: CollectionEntry;
  unit: number | null;
  line: number | null;
  url: string | null;
}

export interface ExportTotals {
  cards: number;
  unique: number;
  market: number;
  priced: number;
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Always label Normal/Foil so finishes stay distinct when selling. */
export function exportCardName(entry: CollectionEntry): string {
  return `${entry.card.name} (${finishLabel(entry.finish)})`;
}

/** Set code + collector number, e.g. ReC-SLM-001 */
export function exportCardCode(entry: CollectionEntry): string {
  const prefix = entry.card.setPrefix.trim() || "GA";
  const num = entry.card.collectorNumber.trim() || "?";
  return `${prefix}-${num}`;
}

/** Quantity label for export, e.g. (14pcs) */
export function exportQuantity(quantity: number): string {
  return `(${quantity}pcs)`;
}

export function sortExportRows(rows: ExportRow[]): ExportRow[] {
  return [...rows].sort((a, b) => {
    const name = a.entry.card.name.localeCompare(b.entry.card.name);
    if (name) return name;
    const code = exportCardCode(a.entry).localeCompare(exportCardCode(b.entry));
    if (code) return code;
    // Normal before Foil for the same printing
    if (a.entry.finish === b.entry.finish) return 0;
    return a.entry.finish === "normal" ? -1 : 1;
  });
}

function unitPriceCsv(unit: number | null): string {
  return unit != null ? unit.toFixed(2) : "";
}

function totalPriceCsv(line: number | null): string {
  return line != null ? line.toFixed(2) : "";
}

function unitPriceText(unit: number | null): string {
  return unit != null ? formatUsd(unit) : "—";
}

function totalPriceText(line: number | null): string {
  return line != null ? formatUsd(line) : "—";
}

/** Spreadsheet inventory: Card name, Code, Unit price, Total quantity, Total price. */
export function buildCollectionCsv(
  rows: ExportRow[],
  totals?: ExportTotals,
): string {
  const sorted = sortExportRows(rows);
  const header = [
    "Card name",
    "Code",
    "Unit price",
    "Total quantity",
    "Total price",
  ];
  const lines = [header.join(",")];
  for (const { entry, unit, line } of sorted) {
    lines.push(
      [
        csvEscape(exportCardName(entry)),
        csvEscape(exportCardCode(entry)),
        unitPriceCsv(unit),
        csvEscape(exportQuantity(entry.quantity)),
        totalPriceCsv(line),
      ].join(","),
    );
  }

  const cards = totals?.cards ?? sorted.reduce((n, r) => n + r.entry.quantity, 0);
  const market =
    totals?.market ?? sorted.reduce((n, r) => n + (r.line ?? 0), 0);
  lines.push(
    [
      "TOTAL",
      "",
      "",
      csvEscape(exportQuantity(cards)),
      market > 0 ? market.toFixed(2) : "",
    ].join(","),
  );

  return `${lines.join("\n")}\n`;
}

/** Human-readable list with the same columns for Discord / SMS / Notes. */
export function buildCollectionShareText(
  rows: ExportRow[],
  totals: ExportTotals,
): string {
  const sorted = sortExportRows(rows);
  const dated = new Date().toISOString().slice(0, 10);
  const lines = [
    `Archive Binder — Grand Archive for sale`,
    `Exported ${dated}`,
    `${exportQuantity(totals.cards)} · ${totals.unique} lines · ${formatUsd(totals.market)} total`,
    "",
    "Card name | Code | Unit price | Total quantity | Total price",
    "—".repeat(24),
  ];

  for (const { entry, unit, line } of sorted) {
    lines.push(
      [
        exportCardName(entry),
        exportCardCode(entry),
        unitPriceText(unit),
        exportQuantity(entry.quantity),
        totalPriceText(line),
      ].join(" | "),
    );
  }

  lines.push("—".repeat(24));
  lines.push(
    [
      "TOTAL",
      "",
      "",
      exportQuantity(totals.cards),
      formatUsd(totals.market),
    ].join(" | "),
  );
  lines.push("");
  lines.push("Prices are TCGPlayer market estimates and may change.");

  return lines.join("\n");
}

/**
 * Dark checklist image for Discord / Marketplace screenshots.
 * Returns null when canvas is unavailable (e.g. some test envs).
 */
export async function buildCollectionShareImage(
  rows: ExportRow[],
  totals: ExportTotals,
): Promise<Blob | null> {
  if (typeof document === "undefined") return null;

  const sorted = sortExportRows(rows);
  const width = 1080;
  const padX = 48;
  const headerH = 168;
  const rowH = 44;
  const footerH = 120;
  const height = Math.max(
    640,
    headerH + sorted.length * rowH + footerH + 24,
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Background
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, "#0d1219");
  bg.addColorStop(1, "#07090d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Accent rule
  ctx.fillStyle = "#d4af6c";
  ctx.fillRect(0, 0, width, 6);

  ctx.fillStyle = "#d4af6c";
  ctx.font = "700 22px Figtree, Avenir Next, Segoe UI, sans-serif";
  ctx.fillText("ARCHIVE BINDER", padX, 48);

  ctx.fillStyle = "#ebe6dc";
  ctx.font = "650 42px Fraunces, Palatino Linotype, serif";
  ctx.fillText("Grand Archive — for sale", padX, 98);

  ctx.fillStyle = "#9aa6b5";
  ctx.font = "400 22px Figtree, Avenir Next, Segoe UI, sans-serif";
  const dated = new Date().toISOString().slice(0, 10);
  ctx.fillText(
    `${dated}  ·  ${exportQuantity(totals.cards)}  ·  ${formatUsd(totals.market)} total`,
    padX,
    136,
  );

  // Column headers
  const cols = [
    { label: "Card name", x: padX, w: 420 },
    { label: "Code", x: padX + 430, w: 170 },
    { label: "Unit", x: padX + 610, w: 110 },
    { label: "Qty", x: padX + 730, w: 120 },
    { label: "Total", x: padX + 860, w: 130 },
  ];
  let y = headerH;
  ctx.fillStyle = "rgba(212,175,108,0.12)";
  ctx.fillRect(padX - 12, y - 28, width - padX * 2 + 24, 36);
  ctx.fillStyle = "#d4af6c";
  ctx.font = "700 18px Figtree, Avenir Next, Segoe UI, sans-serif";
  for (const col of cols) {
    ctx.fillText(col.label, col.x, y - 4);
  }

  ctx.font = "500 20px Figtree, Avenir Next, Segoe UI, sans-serif";
  for (let i = 0; i < sorted.length; i++) {
    y = headerH + (i + 1) * rowH;
    const { entry, unit, line } = sorted[i];
    if (i % 2 === 1) {
      ctx.fillStyle = "rgba(255,255,255,0.03)";
      ctx.fillRect(padX - 12, y - 30, width - padX * 2 + 24, rowH);
    }

    const name = exportCardName(entry);
    ctx.fillStyle = "#ebe6dc";
    ctx.fillText(truncate(ctx, name, cols[0].w), cols[0].x, y);

    ctx.fillStyle = "#9aa6b5";
    ctx.fillText(exportCardCode(entry), cols[1].x, y);

    ctx.fillStyle = "#ebe6dc";
    ctx.fillText(unitPriceText(unit), cols[2].x, y);
    ctx.fillText(exportQuantity(entry.quantity), cols[3].x, y);

    ctx.fillStyle = "#d4af6c";
    ctx.fillText(totalPriceText(line), cols[4].x, y);
  }

  // Totals footer
  const footY = headerH + sorted.length * rowH + 56;
  ctx.strokeStyle = "rgba(212,175,108,0.35)";
  ctx.beginPath();
  ctx.moveTo(padX, footY - 36);
  ctx.lineTo(width - padX, footY - 36);
  ctx.stroke();

  ctx.fillStyle = "#ebe6dc";
  ctx.font = "700 24px Figtree, Avenir Next, Segoe UI, sans-serif";
  ctx.fillText("TOTAL", padX, footY);
  ctx.fillText(exportQuantity(totals.cards), cols[3].x, footY);
  ctx.fillStyle = "#d4af6c";
  ctx.fillText(formatUsd(totals.market), cols[4].x, footY);

  ctx.fillStyle = "#9aa6b5";
  ctx.font = "400 16px Figtree, Avenir Next, Segoe UI, sans-serif";
  ctx.fillText(
    "TCGPlayer market estimates · prices may change",
    padX,
    footY + 36,
  );

  return await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/png");
  });
}

function truncate(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = "…";
  let cut = text;
  while (cut.length > 1 && ctx.measureText(cut + ellipsis).width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return cut + ellipsis;
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
 * Prefer native share (list + CSV + checklist image), else download files
 * and copy the text list.
 */
export async function exportCollectionInventory(
  rows: ExportRow[],
  totals: ExportTotals,
): Promise<ExportResult> {
  const stamp = new Date().toISOString().slice(0, 10);
  const csvName = `archive-binder-collection-${stamp}.csv`;
  const imageName = `archive-binder-collection-${stamp}.png`;
  const csv = buildCollectionCsv(rows, totals);
  const text = buildCollectionShareText(rows, totals);
  const csvBlob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const imageBlob = await buildCollectionShareImage(rows, totals);

  const files: File[] = [];
  if (typeof File !== "undefined") {
    files.push(new File([csvBlob], csvName, { type: "text/csv" }));
    if (imageBlob) {
      files.push(new File([imageBlob], imageName, { type: "image/png" }));
    }
  }

  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      const payload: ShareData = {
        title: "Grand Archive collection for sale",
        text,
      };
      if (files.length && navigator.canShare?.({ files })) {
        payload.files = files;
      } else if (
        imageBlob &&
        files.length === 2 &&
        navigator.canShare?.({ files: [files[1]] })
      ) {
        // Some Android WebViews accept image but not CSV.
        payload.files = [files[1]];
      }
      await navigator.share(payload);
      return { mode: "shared" };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw err;
      }
    }
  }

  downloadBlob(csvBlob, csvName);
  if (imageBlob) downloadBlob(imageBlob, imageName);

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return { mode: "copied" };
    }
  } catch {
    // Clipboard may be blocked; downloads still succeeded.
  }

  return { mode: "downloaded" };
}
