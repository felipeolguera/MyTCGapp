import { extractSetCodes, isWeakNameQuery, type SetCodeHit } from "./match";

export interface OcrScanResult {
  nameCandidates: string[];
  setCodes: SetCodeHit[];
  rawTitleText: string;
  rawFooterText: string;
}

async function loadImage(source: Blob): Promise<HTMLImageElement | ImageBitmap> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(source);
  }
  const url = URL.createObjectURL(source);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function cropBand(
  source: CanvasImageSource,
  width: number,
  height: number,
  yStartRatio: number,
  yEndRatio: number,
  upscale = 2,
): HTMLCanvasElement {
  const y0 = Math.floor(height * yStartRatio);
  const y1 = Math.floor(height * yEndRatio);
  const bandH = Math.max(1, y1 - y0);
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(width * upscale);
  canvas.height = Math.floor(bandH * upscale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    source,
    0,
    y0,
    width,
    bandH,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  // Boost contrast for OCR.
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    const boosted = gray < 140 ? gray * 0.65 : Math.min(255, gray * 1.25 + 20);
    data[i] = data[i + 1] = data[i + 2] = boosted;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

async function ocrCanvas(canvas: HTMLCanvasElement): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const {
      data: { text },
    } = await worker.recognize(canvas);
    return text;
  } finally {
    await worker.terminate();
  }
}

/**
 * OCR focused on the title band (top) and footer (set/number), not the
 * full effect text — that was causing huge fuzzy result lists.
 */
export async function scanCardImage(image: Blob): Promise<OcrScanResult> {
  const bitmap = await loadImage(image);
  const width =
    "width" in bitmap
      ? (bitmap as ImageBitmap).width
      : (bitmap as HTMLImageElement).naturalWidth;
  const height =
    "height" in bitmap
      ? (bitmap as ImageBitmap).height
      : (bitmap as HTMLImageElement).naturalHeight;

  const titleBand = cropBand(bitmap, width, height, 0.02, 0.22, 2.4);
  const footerBand = cropBand(bitmap, width, height, 0.78, 0.98, 2.2);

  if ("close" in bitmap && typeof bitmap.close === "function") {
    bitmap.close();
  }

  const [rawTitleText, rawFooterText] = await Promise.all([
    ocrCanvas(titleBand),
    ocrCanvas(footerBand),
  ]);

  return {
    nameCandidates: rankNameCandidates(rawTitleText),
    setCodes: extractSetCodes(`${rawFooterText}\n${rawTitleText}`),
    rawTitleText,
    rawFooterText,
  };
}

/** @deprecated Prefer scanCardImage — kept for tests/simple callers. */
export async function extractCardNameCandidates(
  image: Blob | HTMLCanvasElement,
): Promise<string[]> {
  if (image instanceof HTMLCanvasElement) {
    const text = await ocrCanvas(image);
    return rankNameCandidates(text);
  }
  const scanned = await scanCardImage(image);
  return scanned.nameCandidates;
}

export function rankNameCandidates(ocrText: string): string[] {
  const lines = ocrText
    .split(/\r?\n/)
    .map((line) => line.replace(/[^A-Za-z0-9' :-]/g, "").trim())
    .filter((line) => line.length >= 4);

  const scored = lines
    .map((line, index) => {
      if (isWeakNameQuery(line)) {
        return { line, score: -1 };
      }
      const letters = (line.match(/[A-Za-z]/g) ?? []).length;
      const ratio = letters / Math.max(line.length, 1);
      const words = line.split(/\s+/).filter(Boolean);
      const multiWordBonus = words.length >= 2 ? 0.25 : 0;
      // Titles are near the top of the OCR block.
      const positionBonus = Math.max(0, 0.2 - index * 0.03);
      const lengthScore =
        line.length >= 6 && line.length <= 42 ? 1 : line.length >= 4 ? 0.55 : 0.2;
      const titleCaseBonus = /^[A-Z][A-Za-z' -]+$/.test(line) ? 0.1 : 0;
      return {
        line,
        score:
          ratio * lengthScore + multiWordBonus + positionBonus + titleCaseBonus,
      };
    })
    .filter((item) => item.score >= 0.65)
    .sort((a, b) => b.score - a.score);

  const unique: string[] = [];
  for (const item of scored) {
    const normalized = item.line.replace(/\s+/g, " ").trim();
    if (!unique.some((u) => u.toLowerCase() === normalized.toLowerCase())) {
      unique.push(normalized);
    }
    if (unique.length >= 4) break;
  }
  return unique;
}
