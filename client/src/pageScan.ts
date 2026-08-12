import type { CardFinish, GaCardEdition } from "./types";
import {
  matchRgbaVisually,
  shouldAutoConfirm,
  type VisualMatch,
} from "./visualMatch";

export type PageGridPreset = "3x3" | "4x3";

export interface PageGridCellRect {
  slot: number;
  row: number;
  col: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PageScanCell {
  slot: number;
  row: number;
  col: number;
  matches: VisualMatch[];
  /** Crop preview for the pocket. */
  previewUrl: string;
  selected: GaCardEdition | null;
  finish: CardFinish;
  /** User or auto skip (empty / weak). */
  skipped: boolean;
  /** Needs a tap to confirm among rivals. */
  uncertain: boolean;
}

export function pageGridDims(preset: PageGridPreset): {
  rows: number;
  cols: number;
} {
  return preset === "4x3" ? { rows: 3, cols: 4 } : { rows: 3, cols: 3 };
}

/**
 * Axis-aligned binder pocket rects inside a page photo.
 * `margin` clears binder edges; `cellPad` trims pocket borders.
 */
export function pageGridRects(
  width: number,
  height: number,
  rows: number,
  cols: number,
  opts: { margin?: number; cellPad?: number } = {},
): PageGridCellRect[] {
  const margin = opts.margin ?? 0.04;
  const cellPad = opts.cellPad ?? 0.08;
  const mx = Math.floor(width * margin);
  const my = Math.floor(height * margin);
  const innerW = Math.max(1, width - mx * 2);
  const innerH = Math.max(1, height - my * 2);
  const cellW = innerW / cols;
  const cellH = innerH / rows;
  const padX = Math.floor(cellW * cellPad);
  const padY = Math.floor(cellH * cellPad);

  const out: PageGridCellRect[] = [];
  let slot = 1;
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const x0 = mx + Math.floor(c * cellW) + padX;
      const y0 = my + Math.floor(r * cellH) + padY;
      const x1 = mx + Math.floor((c + 1) * cellW) - padX;
      const y1 = my + Math.floor((r + 1) * cellH) - padY;
      out.push({
        slot,
        row: r,
        col: c,
        x: Math.max(0, x0),
        y: Math.max(0, y0),
        w: Math.max(1, x1 - x0),
        h: Math.max(1, y1 - y0),
      });
      slot += 1;
    }
  }
  return out;
}

async function blobToImageData(blob: Blob): Promise<ImageData> {
  const bitmap =
    typeof createImageBitmap === "function"
      ? await createImageBitmap(blob)
      : await new Promise<HTMLImageElement>((resolve, reject) => {
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
          };
          img.onerror = reject;
          img.src = url;
        });

  const width =
    "width" in bitmap
      ? (bitmap as ImageBitmap).width
      : (bitmap as HTMLImageElement).naturalWidth;
  const height =
    "height" in bitmap
      ? (bitmap as ImageBitmap).height
      : (bitmap as HTMLImageElement).naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unsupported");
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
  return ctx.getImageData(0, 0, width, height);
}

function downscaleImageData(
  source: ImageData,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  maxEdge = 640,
): { data: Uint8ClampedArray; width: number; height: number; preview: HTMLCanvasElement } {
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));

  const src = document.createElement("canvas");
  src.width = source.width;
  src.height = source.height;
  const sctx = src.getContext("2d", { willReadFrequently: true });
  if (!sctx) throw new Error("Canvas unsupported");
  sctx.putImageData(source, 0, 0);

  const out = document.createElement("canvas");
  out.width = dw;
  out.height = dh;
  const octx = out.getContext("2d", { willReadFrequently: true });
  if (!octx) throw new Error("Canvas unsupported");
  octx.drawImage(src, sx, sy, sw, sh, 0, 0, dw, dh);
  const image = octx.getImageData(0, 0, dw, dh);
  return { data: image.data, width: dw, height: dh, preview: out };
}

function canvasToBlobUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not encode cell preview"));
          return;
        }
        resolve(URL.createObjectURL(blob));
      },
      "image/jpeg",
      0.85,
    );
  });
}

const WEAK_SCORE = 0.55;
const ACCEPT_SCORE = 0.65;

export function summarizePageCell(matches: VisualMatch[]): {
  selected: GaCardEdition | null;
  skipped: boolean;
  uncertain: boolean;
} {
  if (matches.length === 0 || matches[0].score < WEAK_SCORE) {
    return { selected: null, skipped: true, uncertain: false };
  }
  const uncertain = !shouldAutoConfirm(matches);
  if (matches[0].score < ACCEPT_SCORE && uncertain) {
    return { selected: null, skipped: true, uncertain: true };
  }
  return {
    selected: matches[0].card,
    skipped: false,
    uncertain,
  };
}

/** Match every pocket in a binder-page photo (fixed grid). */
export async function matchPagePhoto(
  photo: Blob,
  opts: {
    rows: number;
    cols: number;
    margin?: number;
    cellPad?: number;
    limit?: number;
    maxDistance?: number;
    onProgress?: (done: number, total: number) => void;
  },
): Promise<PageScanCell[]> {
  const full = await blobToImageData(photo);
  const rects = pageGridRects(full.width, full.height, opts.rows, opts.cols, {
    margin: opts.margin,
    cellPad: opts.cellPad,
  });
  const cells: PageScanCell[] = [];

  for (let i = 0; i < rects.length; i += 1) {
    const rect = rects[i];
    const cropped = downscaleImageData(
      full,
      rect.x,
      rect.y,
      rect.w,
      rect.h,
    );
    const matches = await matchRgbaVisually(
      cropped.data,
      cropped.width,
      cropped.height,
      {
        limit: opts.limit ?? 4,
        maxDistance: opts.maxDistance ?? 40,
      },
    );
    const summary = summarizePageCell(matches);
    const previewUrl = await canvasToBlobUrl(cropped.preview);
    cells.push({
      slot: rect.slot,
      row: rect.row,
      col: rect.col,
      matches,
      previewUrl,
      selected: summary.selected,
      finish: "normal",
      skipped: summary.skipped,
      uncertain: summary.uncertain,
    });
    opts.onProgress?.(i + 1, rects.length);
  }

  return cells;
}

export function revokePageCellPreviews(cells: PageScanCell[]): void {
  for (const cell of cells) {
    if (cell.previewUrl.startsWith("blob:")) {
      URL.revokeObjectURL(cell.previewUrl);
    }
  }
}

export function pageScanStatus(cells: PageScanCell[]): string {
  const ready = cells.filter((c) => c.selected && !c.skipped).length;
  const review = cells.filter(
    (c) => c.uncertain || (!c.skipped && !c.selected),
  ).length;
  const skipped = cells.filter((c) => c.skipped).length;
  return `Matched ${ready}/${cells.length}${
    review ? ` · ${review} need review` : ""
  }${skipped ? ` · ${skipped} skipped` : ""}`;
}
