import { createWorker, PSM, type Worker } from "tesseract.js";

const INIT_TIMEOUT_MS = 8_000;
const RECOGNIZE_TIMEOUT_MS = 2_000;

let readyWorker: Worker | null = null;
let warming = false;
/** After a hang/fail, skip OCR for the rest of the session (visual match still works). */
let ocrDisabled = false;

function assetBase(): string {
  const base = import.meta.env.BASE_URL || "./";
  return base.endsWith("/") ? base : `${base}/`;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      },
    );
  });
}

function disableOcr(reason: unknown): void {
  ocrDisabled = true;
  readyWorker = null;
  warming = false;
  if (import.meta.env.DEV) {
    console.warn("[nameOcr] disabled:", reason);
  }
}

/** True once the OCR worker finished loading (false while warming / disabled). */
export function isNameOcrReady(): boolean {
  return readyWorker !== null && !ocrDisabled;
}

/**
 * Warm OCR in the background after the visual index loads.
 * Scans never wait on this — if it fails, matching stays visual-only.
 */
export function warmNameOcr(): void {
  if (ocrDisabled || readyWorker || warming) return;
  warming = true;
  const base = assetBase();

  void (async () => {
    try {
      // Capacitor WebViews often hang on blob workers + SIMD WASM.
      const worker = await withTimeout(
        createWorker("eng", 1, {
          workerPath: `${base}tesseract/worker.min.js`,
          corePath: `${base}tesseract/tesseract-core-lstm.wasm.js`,
          langPath: `${base}tessdata`,
          gzip: true,
          workerBlobURL: false,
        }),
        INIT_TIMEOUT_MS,
        "OCR init",
      );
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_LINE,
        tessedit_char_whitelist:
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 '-",
      });
      readyWorker = worker;
      warming = false;
    } catch (err) {
      disableOcr(err);
    }
  })();
}

/**
 * GA name plate sits between cost (left) and element (right), near the top.
 * Crop only that band so OCR ignores rules text / type line.
 */
export async function cropCardNameBand(photo: Blob): Promise<Blob> {
  const bitmap =
    typeof createImageBitmap === "function"
      ? await createImageBitmap(photo)
      : await new Promise<HTMLImageElement>((resolve, reject) => {
          const url = URL.createObjectURL(photo);
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

  // Empirically fits GA name bars after the camera's center card crop.
  const sx = Math.floor(width * 0.16);
  const sy = Math.floor(height * 0.045);
  const sw = Math.max(1, Math.floor(width * 0.68));
  const sh = Math.max(1, Math.floor(height * 0.1));

  const scale = 2;
  const out = document.createElement("canvas");
  out.width = sw * scale;
  out.height = sh * scale;
  const ctx = out.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unsupported");
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    bitmap as CanvasImageSource,
    sx,
    sy,
    sw,
    sh,
    0,
    0,
    out.width,
    out.height,
  );

  // Boost contrast for dark serif text on pale name plates.
  const image = ctx.getImageData(0, 0, out.width, out.height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = g < 140 ? 0 : 255;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
  }
  ctx.putImageData(image, 0, 0);

  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    out.toBlob((b) => resolve(b), "image/png"),
  );
  if (!blob) throw new Error("Could not encode name band");
  return blob;
}

/**
 * OCR only the top name band. Returns "" immediately if OCR isn't ready yet,
 * and never blocks longer than RECOGNIZE_TIMEOUT_MS.
 */
export async function ocrCardName(photo: Blob): Promise<string> {
  const worker = readyWorker;
  if (ocrDisabled || !worker) return "";
  try {
    const band = await cropCardNameBand(photo);
    const result = await withTimeout(
      worker.recognize(band),
      RECOGNIZE_TIMEOUT_MS,
      "OCR recognize",
    );
    return (result.data.text || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  } catch (err) {
    // Recognize hang/fail — stop using OCR this session so snaps stay snappy.
    disableOcr(err);
    return "";
  }
}
