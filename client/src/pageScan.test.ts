import { describe, expect, it } from "vitest";
import {
  pageGridDims,
  pageGridRects,
  pageScanStatus,
  summarizePageCell,
  type PageScanCell,
} from "./pageScan";
import type { VisualMatch } from "./visualMatch";
import type { GaCardEdition } from "./types";

function card(name: string, editionId = name): GaCardEdition {
  return {
    editionId,
    cardId: editionId,
    name,
    slug: name,
    types: [],
    classes: [],
    element: null,
    elements: [],
    costMemory: null,
    costReserve: null,
    level: null,
    life: null,
    power: null,
    effect: null,
    rarity: 1,
    collectorNumber: "001",
    imagePath: "/x.jpg",
    imageUrl: "https://example.com/x.jpg",
    setName: "Test",
    setPrefix: "TST",
    illustrator: null,
  };
}

function match(score: number, name = "A"): VisualMatch {
  return {
    card: card(name),
    distance: Math.round((1 - score) * 72),
    score,
  };
}

describe("pageGrid", () => {
  it("maps presets to rows/cols", () => {
    expect(pageGridDims("3x3")).toEqual({ rows: 3, cols: 3 });
    expect(pageGridDims("4x3")).toEqual({ rows: 3, cols: 4 });
  });

  it("lays out 9 unique slots left-to-right", () => {
    const rects = pageGridRects(900, 1200, 3, 3, { margin: 0, cellPad: 0 });
    expect(rects).toHaveLength(9);
    expect(rects.map((r) => r.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(rects[0]).toMatchObject({ x: 0, y: 0, w: 300, h: 400 });
    expect(rects[1].x).toBe(300);
    expect(rects[3].y).toBe(400);
  });

  it("applies margin and cell padding", () => {
    const rects = pageGridRects(1000, 1000, 2, 2, {
      margin: 0.1,
      cellPad: 0.1,
    });
    expect(rects[0].x).toBeGreaterThan(100);
    expect(rects[0].w).toBeLessThan(400);
  });
});

describe("summarizePageCell", () => {
  it("skips empty / weak pockets", () => {
    expect(summarizePageCell([])).toEqual({
      selected: null,
      skipped: true,
      uncertain: false,
    });
    expect(summarizePageCell([match(0.4)]).skipped).toBe(true);
  });

  it("accepts a strong lone hit", () => {
    const s = summarizePageCell([match(0.9)]);
    expect(s.skipped).toBe(false);
    expect(s.selected?.name).toBe("A");
    expect(s.uncertain).toBe(false);
  });
});

describe("pageScanStatus", () => {
  it("summarizes ready / review / skipped counts", () => {
    const cells: PageScanCell[] = [
      {
        slot: 1,
        row: 0,
        col: 0,
        matches: [match(0.9)],
        previewUrl: "",
        selected: card("A"),
        finish: "normal",
        skipped: false,
        uncertain: false,
      },
      {
        slot: 2,
        row: 0,
        col: 1,
        matches: [match(0.8), match(0.79, "B")],
        previewUrl: "",
        selected: card("A"),
        finish: "normal",
        skipped: false,
        uncertain: true,
      },
      {
        slot: 3,
        row: 0,
        col: 2,
        matches: [],
        previewUrl: "",
        selected: null,
        finish: "normal",
        skipped: true,
        uncertain: false,
      },
    ];
    expect(pageScanStatus(cells)).toContain("Matched 2/3");
    expect(pageScanStatus(cells)).toContain("need review");
    expect(pageScanStatus(cells)).toContain("skipped");
  });
});
