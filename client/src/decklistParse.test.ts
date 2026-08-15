import { describe, expect, it } from "vitest";
import { decklistCardCount, parseDecklist } from "./decklistParse";

const SAMPLE = `// Obla
// Built with AdvGA v0.94
# Material Deck

1 Spirit of Water
1 Arondight, Azure Blade
1 Jin, Zealous Maverick

# Main Deck

4 Fracturize
3 Engulf
4 Tidal Lock

# Sideboard
`;

describe("parseDecklist", () => {
  it("reads AdvGA title, sections, and qty lines", () => {
    const parsed = parseDecklist(SAMPLE);
    expect(parsed.title).toBe("Obla");
    expect(parsed.sections).toEqual([
      "Material Deck",
      "Main Deck",
      "Sideboard",
    ]);
    expect(parsed.lines).toHaveLength(6);
    expect(parsed.lines[0]).toMatchObject({
      quantity: 1,
      name: "Spirit of Water",
      section: "Material Deck",
    });
    expect(parsed.lines.find((l) => l.name === "Fracturize")).toMatchObject({
      quantity: 4,
      section: "Main Deck",
    });
    expect(decklistCardCount(parsed)).toBe(1 + 1 + 1 + 4 + 3 + 4);
  });

  it("accepts 4x Name and Name x4", () => {
    const parsed = parseDecklist(`# Main\n4x Freeze Stiff\nEngulf x3\n`);
    expect(parsed.lines).toEqual([
      expect.objectContaining({ quantity: 4, name: "Freeze Stiff" }),
      expect.objectContaining({ quantity: 3, name: "Engulf" }),
    ]);
  });

  it("merges duplicate lines in the same section", () => {
    const parsed = parseDecklist(`# Main Deck\n2 Engulf\n1 Engulf\n`);
    expect(parsed.lines).toHaveLength(1);
    expect(parsed.lines[0].quantity).toBe(3);
  });

  it("ignores Built with banners for the title", () => {
    const parsed = parseDecklist(`// Built with AdvGA v0.94\n# Main\n1 Engulf\n`);
    expect(parsed.title).toBe("Imported deck");
  });
});
