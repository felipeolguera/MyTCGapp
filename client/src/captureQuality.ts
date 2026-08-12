/** Simple glare / blur heuristics on captured card crops. */

export interface CaptureQuality {
  glareRatio: number;
  blurScore: number;
  warnings: string[];
}

function toGray(data: Uint8ClampedArray, i: number): number {
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

/**
 * Estimate glare (bright clipped regions) and blur (Laplacian variance).
 * Higher blurScore = sharper. Typical sharp phone crop > ~80; soft < ~35.
 */
export function assessCaptureQuality(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): CaptureQuality {
  const pixels = width * height;
  if (pixels < 16) {
    return { glareRatio: 0, blurScore: 0, warnings: ["Capture too small — retake"] };
  }

  let bright = 0;
  // Downsample for speed
  const stepX = Math.max(1, Math.floor(width / 96));
  const stepY = Math.max(1, Math.floor(height / 128));
  let samples = 0;

  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      samples += 1;
      if (r >= 245 && g >= 245 && b >= 245) bright += 1;
      else if (r + g + b >= 720 && Math.max(r, g, b) - Math.min(r, g, b) < 28) {
        bright += 1;
      }
    }
  }

  const glareRatio = samples ? bright / samples : 0;

  // Laplacian variance on a small grayscale grid
  const gw = Math.min(64, width);
  const gh = Math.min(90, height);
  const gray = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const sx = Math.floor((x / gw) * width);
      const sy = Math.floor((y / gh) * height);
      gray[y * gw + x] = toGray(data, (sy * width + sx) * 4);
    }
  }

  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < gh - 1; y++) {
    for (let x = 1; x < gw - 1; x++) {
      const c = gray[y * gw + x];
      const lap =
        -4 * c +
        gray[y * gw + (x - 1)] +
        gray[y * gw + (x + 1)] +
        gray[(y - 1) * gw + x] +
        gray[(y + 1) * gw + x];
      sum += lap;
      sumSq += lap * lap;
      n += 1;
    }
  }
  const mean = n ? sum / n : 0;
  const blurScore = n ? sumSq / n - mean * mean : 0;

  const warnings: string[] = [];
  if (glareRatio >= 0.12) {
    warnings.push("Glare detected — tilt the card or move the light");
  } else if (glareRatio >= 0.07) {
    warnings.push("Possible glare — avoid shiny reflections");
  }
  if (blurScore < 28) {
    warnings.push("Image looks soft — hold steady and retake");
  } else if (blurScore < 45) {
    warnings.push("Slight blur — tap again if the match looks wrong");
  }

  return { glareRatio, blurScore, warnings };
}

export async function assessBlobQuality(blob: Blob): Promise<CaptureQuality> {
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
  if (!ctx) {
    return { glareRatio: 0, blurScore: 999, warnings: [] };
  }
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0);
  const { data } = ctx.getImageData(0, 0, width, height);
  return assessCaptureQuality(data, width, height);
}
