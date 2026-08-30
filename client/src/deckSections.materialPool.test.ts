import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cardAllowedInSection, isMaterialCard } from "./deckSections";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const index = JSON.parse(
  readFileSync(join(root, "public/ga-card-index.json"), "utf8"),
) as { cards: Array<{ name: string; types: string[] }> };

describe("material deck search pool", () => {
  it("includes known regalia/champions and excludes main-deck actions", () => {
    const byName = new Map(index.cards.map((c) => [c.name.toLowerCase(), c]));
    expect(isMaterialCard(byName.get("spirit of water")!)).toBe(true);
    expect(isMaterialCard(byName.get("quicksilver grail")!)).toBe(true);
    expect(isMaterialCard(byName.get("fracturize")!)).toBe(false);

    const materialHits = index.cards.filter(
      (c) =>
        c.name.toLowerCase().includes("spirit") &&
        cardAllowedInSection(c, "material"),
    );
    expect(materialHits.length).toBeGreaterThan(0);
    expect(
      materialHits.every((c) => isMaterialCard(c)),
    ).toBe(true);

    const mainHits = index.cards.filter(
      (c) =>
        c.name.toLowerCase().startsWith("frac") &&
        cardAllowedInSection(c, "main"),
    );
    expect(mainHits.some((c) => c.name === "Fracturize")).toBe(true);
    expect(mainHits.every((c) => !isMaterialCard(c))).toBe(true);
  });
});
