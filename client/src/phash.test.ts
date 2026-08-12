import { describe, expect, it } from "vitest";
import {
  aHashFromGray8x8,
  combinedDistance,
  dHashFromGray9x8,
  hammingHex,
  hashesFromRgba,
} from "./phash";

describe("phash", () => {
  it("is stable for identical pixels", () => {
    const g9 = new Float32Array(72);
    const g8 = new Float32Array(64);
    for (let i = 0; i < 72; i++) g9[i] = (i * 17) % 255;
    for (let i = 0; i < 64; i++) g8[i] = (i * 13) % 255;
    const d = dHashFromGray9x8(g9);
    const a = aHashFromGray8x8(g8);
    expect(d).toHaveLength(16);
    expect(a).toHaveLength(16);
    expect(hammingHex(d, d)).toBe(0);
    expect(combinedDistance({ dHash: d, aHash: a }, { dHash: d, aHash: a })).toBe(
      0,
    );
  });

  it("hashes rgba buffers", () => {
    const rgba = new Uint8ClampedArray(10 * 10 * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba[i] = i % 255;
      rgba[i + 1] = (i * 2) % 255;
      rgba[i + 2] = (i * 3) % 255;
      rgba[i + 3] = 255;
    }
    const h = hashesFromRgba(rgba, 10, 10);
    expect(h.dHash).toMatch(/^[0-9a-f]{16}$/);
    expect(h.aHash).toMatch(/^[0-9a-f]{16}$/);
  });
});
