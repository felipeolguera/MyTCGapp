/** 64-bit difference hash helpers shared by the app and index builder. */

export type Hash64 = string; // 16 hex chars

/** Compute dHash from grayscale pixels of size 9x8 (row-major). */
export function dHashFromGray9x8(pixels: ArrayLike<number>): Hash64 {
  if (pixels.length < 72) {
    throw new Error("Expected 9x8 grayscale pixels");
  }
  let bits = 0n;
  let bit = 63n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = pixels[y * 9 + x];
      const right = pixels[y * 9 + x + 1];
      if (left > right) bits |= 1n << bit;
      bit -= 1n;
    }
  }
  return bits.toString(16).padStart(16, "0");
}

/** Average hash from 8x8 grayscale. */
export function aHashFromGray8x8(pixels: ArrayLike<number>): Hash64 {
  if (pixels.length < 64) {
    throw new Error("Expected 8x8 grayscale pixels");
  }
  let sum = 0;
  for (let i = 0; i < 64; i++) sum += pixels[i];
  const avg = sum / 64;
  let bits = 0n;
  for (let i = 0; i < 64; i++) {
    if (pixels[i] >= avg) bits |= 1n << BigInt(63 - i);
  }
  return bits.toString(16).padStart(16, "0");
}

export function hammingHex(a: Hash64, b: Hash64): number {
  const x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  // popcount
  let n = x;
  let count = 0;
  while (n > 0n) {
    n &= n - 1n;
    count += 1;
  }
  return count;
}

/** Combined distance: lower is more similar. Max ~128. */
export function combinedDistance(
  probe: { dHash: Hash64; aHash: Hash64 },
  candidate: { dHash: Hash64; aHash: Hash64 },
): number {
  return (
    hammingHex(probe.dHash, candidate.dHash) +
    hammingHex(probe.aHash, candidate.aHash)
  );
}

export function distanceToScore(distance: number): number {
  // 0 → 1.0, 20 → ~0.7, 40 → ~0.4, 64+ → low
  return Math.max(0, Math.min(1, 1 - distance / 72));
}

/** Downscale RGBA ImageData-like buffer to grayscale w×h with simple box filter. */
export function resizeRgbaToGray(
  src: Uint8ClampedArray | Uint8Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Float32Array {
  const out = new Float32Array(dstW * dstH);
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const x0 = Math.floor((x / dstW) * srcW);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) / dstW) * srcW));
      const y0 = Math.floor((y / dstH) * srcH);
      const y1 = Math.max(y0 + 1, Math.floor(((y + 1) / dstH) * srcH));
      let sum = 0;
      let n = 0;
      for (let yy = y0; yy < y1 && yy < srcH; yy++) {
        for (let xx = x0; xx < x1 && xx < srcW; xx++) {
          const i = (yy * srcW + xx) * 4;
          sum += src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114;
          n += 1;
        }
      }
      out[y * dstW + x] = n ? sum / n : 0;
    }
  }
  return out;
}

export function hashesFromRgba(
  src: Uint8ClampedArray | Uint8Array,
  srcW: number,
  srcH: number,
): { dHash: Hash64; aHash: Hash64 } {
  const g9 = resizeRgbaToGray(src, srcW, srcH, 9, 8);
  const g8 = resizeRgbaToGray(src, srcW, srcH, 8, 8);
  return {
    dHash: dHashFromGray9x8(g9),
    aHash: aHashFromGray8x8(g8),
  };
}
