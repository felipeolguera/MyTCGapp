import { describe, expect, it } from "vitest";
import { assessCaptureQuality } from "./captureQuality";

function fill(
  width: number,
  height: number,
  paint: (x: number, y: number, i: number, data: Uint8ClampedArray) => void,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      paint(x, y, i, data);
      data[i + 3] = 255;
    }
  }
  return data;
}

describe("captureQuality", () => {
  it("flags heavy glare on near-white crops", () => {
    const data = fill(80, 100, (_x, _y, i, buf) => {
      buf[i] = 252;
      buf[i + 1] = 252;
      buf[i + 2] = 252;
    });
    const q = assessCaptureQuality(data, 80, 100);
    expect(q.glareRatio).toBeGreaterThan(0.5);
    expect(q.warnings.some((w) => /glare/i.test(w))).toBe(true);
  });

  it("flags soft images with low edge energy", () => {
    const data = fill(80, 100, (_x, _y, i, buf) => {
      buf[i] = 120;
      buf[i + 1] = 120;
      buf[i + 2] = 120;
    });
    const q = assessCaptureQuality(data, 80, 100);
    expect(q.blurScore).toBeLessThan(28);
    expect(q.warnings.some((w) => /soft|blur/i.test(w))).toBe(true);
  });

  it("accepts a high-contrast sharp-ish pattern", () => {
    const data = fill(80, 100, (x, y, i, buf) => {
      const v = (x + y) % 4 < 2 ? 20 : 220;
      buf[i] = v;
      buf[i + 1] = v;
      buf[i + 2] = v;
    });
    const q = assessCaptureQuality(data, 80, 100);
    expect(q.glareRatio).toBeLessThan(0.07);
    expect(q.blurScore).toBeGreaterThan(45);
    expect(q.warnings).toHaveLength(0);
  });
});
