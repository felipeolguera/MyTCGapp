import { createWorker, PSM, type Worker } from "tesseract.js";

let workerPromise: Promise<Worker> | null = null;

function assetBase(): string {
  const base = import.meta.env.BASE_URL || "./";
  return base.endsWith("/") ? base : `${base}/`;
}

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    const base = assetBase();
    workerPromise = (async () => {
      const worker = await createWorker("eng", 1, {
        workerPath: `${base}tesseract/worker.min.js`,
        corePath: `${base}tesseract/tesseract-core-simd-lstm.wasm.js`,
        langPath: `${base}tessdata`,
        // gzip traineddata is shipped as eng.traineddata.gz
        gzip: true,
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_LINE,
        tessedit_char_whitelist:
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 '-",
      });
      return worker;
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

/** Warm OCR in the background after the visual index loads. */
export function warmNameOcr(): void {
  void getWorker().catch(() => {
    // Best-effort — visual match still works offline/on failure.
  });
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

/** OCR only the top name band of a card photo. */
export async function ocrCardName(photo: Blob): Promise<string> {
  const band = await cropCardNameBand(photo);
  const worker = await getWorker();
  const result = await worker.recognize(band);
  const text = (result.data.text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}
