import { describe, expect, it } from "vitest";
import { shouldAutoConfirm, type VisualMatch } from "./visualMatch";
import type { GaCardEdition } from "./types";

function card(name: string, editionId: string): GaCardEdition {
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
    card: card(name, name),
    distance: Math.round((1 - score) * 72),
    score,
  };
}

describe("shouldAutoConfirm", () => {
  it("confirms a lone high-confidence hit", () => {
    expect(shouldAutoConfirm([match(0.85)])).toBe(true);
  });

  it("requires a clear gap when rivals exist", () => {
    expect(shouldAutoConfirm([match(0.9, "A"), match(0.88, "B")])).toBe(false);
    expect(shouldAutoConfirm([match(0.9, "A"), match(0.8, "B")])).toBe(true);
  });

  it("rejects weak scores", () => {
    expect(shouldAutoConfirm([match(0.7)])).toBe(false);
    expect(shouldAutoConfirm([])).toBe(false);
  });
});
