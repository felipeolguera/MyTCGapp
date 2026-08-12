import { describe, expect, it } from "vitest";
import {
  nameSimilarity,
  normalizeCardName,
  rankNamesByOcr,
} from "./nameMatch";

describe("nameMatch", () => {
  it("normalizes punctuation and case", () => {
    expect(normalizeCardName("Ghosts of Pendragon")).toBe(
      "ghosts of pendragon",
    );
    expect(normalizeCardName("Alice, Distorted Queen")).toBe(
      "alice distorted queen",
    );
  });

  it("scores near-miss OCR of Ghosts of Pendragon highly", () => {
    expect(nameSimilarity("Ghost of pendragon", "Ghosts of Pendragon")).toBeGreaterThan(
      0.8,
    );
    expect(nameSimilarity("Ghosts of Pendragon", "Ghosts of Pendragon")).toBe(1);
  });

  it("ranks the correct name first among candidates", () => {
    const ranked = rankNamesByOcr("Ghost of pendragon", [
      "Spirit of Fire",
      "Ghosts of Pendragon",
      "Gildas of the Grove",
      "Pendragon Banner",
    ]);
    expect(ranked[0]?.name).toBe("Ghosts of Pendragon");
    expect(ranked[0]?.score ?? 0).toBeGreaterThan(0.75);
  });
});
