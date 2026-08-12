import { describe, expect, it } from "vitest";
import {
  extractSetCodes,
  isWeakNameQuery,
  rankAndFilterMatches,
  scoreCardMatch,
  stringSimilarity,
} from "./match";
import { rankNameCandidates } from "./ocr";
import type { GaCardEdition } from "./types";

function card(partial: Partial<GaCardEdition> & { name: string }): GaCardEdition {
  return {
    editionId: partial.editionId ?? `ed-${partial.name}`,
    cardId: partial.cardId ?? `card-${partial.name}`,
    name: partial.name,
    slug: partial.slug ?? partial.name.toLowerCase().replace(/ /g, "-"),
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
    collectorNumber: partial.collectorNumber ?? "001",
    imagePath: "/x.jpg",
    imageUrl: "https://api.gatcg.com/x.jpg",
    setName: partial.setName ?? "Test",
    setPrefix: partial.setPrefix ?? "TST",
    illustrator: null,
  };
}

describe("rankNameCandidates", () => {
  it("prefers title-like lines and drops effect keywords", () => {
    const text = `
      SPIRIT OF SLIME
      On Enter
      Draw seven cards
      001 / ReC-SLM
    `;
    const ranked = rankNameCandidates(text);
    expect(ranked[0]?.toLowerCase()).toContain("spirit of slime");
    expect(ranked.some((r) => /on enter/i.test(r))).toBe(false);
  });

  it("returns empty for garbage-only OCR", () => {
    expect(rankNameCandidates("###\n!!\n123")).toEqual([]);
  });
});

describe("match scoring", () => {
  it("scores exact names highest", () => {
    expect(stringSimilarity("Spirit of Slime", "Spirit of Slime")).toBe(1);
    expect(
      scoreCardMatch("Spirit of Slime", card({ name: "Spirit of Slime" })),
    ).toBeGreaterThan(
      scoreCardMatch("Spirit", card({ name: "Spirit of Wind" })),
    );
  });

  it("rejects weak single-token queries", () => {
    expect(isWeakNameQuery("Spirit")).toBe(true);
    expect(isWeakNameQuery("On Enter")).toBe(true);
    expect(isWeakNameQuery("Spirit of Slime")).toBe(false);
  });

  it("filters fuzzy API noise down to close names", () => {
    const results = [
      card({ name: "Spirit of Wind", cardId: "a" }),
      card({ name: "Spirit of Fire", cardId: "b" }),
      card({ name: "Spirit of Slime", cardId: "c" }),
      card({ name: "Slime Trail", cardId: "d" }),
      card({ name: "Ancient Spirit", cardId: "e" }),
    ];
    const ranked = rankAndFilterMatches("Spirit of Slime", results, {
      minScore: 0.45,
      limit: 8,
    });
    expect(ranked[0]?.card.name).toBe("Spirit of Slime");
    expect(ranked.length).toBeLessThanOrEqual(3);
  });

  it("parses set codes from footer OCR", () => {
    expect(extractSetCodes("ReC-SLM 001")).toEqual([
      { prefix: "ReC-SLM", collectorNumber: "001" },
    ]);
    expect(extractSetCodes("AMB #12")).toEqual([
      { prefix: "AMB", collectorNumber: "012" },
    ]);
  });
});
