import { describe, expect, it } from "vitest";
import { fuseVisualAndNameMatches, type VisualMatch } from "./visualMatch";
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
    collectorNumber: "012",
    imagePath: "/x.jpg",
    imageUrl: "https://example.com/x.jpg",
    setName: "Test",
    setPrefix: "RDOEVP",
    illustrator: null,
  };
}

describe("fuseVisualAndNameMatches", () => {
  it("promotes OCR name hits over weak art matches", () => {
    const wrong: VisualMatch = {
      card: card("Spirit of Fire", "a"),
      distance: 10,
      score: 0.86,
    };
    const right = card("Ghosts of Pendragon", "b");
    const fused = fuseVisualAndNameMatches(
      [wrong],
      "Ghost of pendragon",
      [right],
      5,
    );
    expect(fused[0]?.card.name).toBe("Ghosts of Pendragon");
    expect(fused[0]?.nameScore ?? 0).toBeGreaterThan(0.8);
  });
});
