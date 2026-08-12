import { describe, expect, it } from "vitest";
import { rankNameCandidates } from "./ocr";

describe("rankNameCandidates", () => {
  it("prefers title-like lines from OCR noise", () => {
    const text = `
      SPIRIT OF SLIME
      001 / ReC-SLM
      On Enter: Draw seven cards.
      ####
    `;
    const ranked = rankNameCandidates(text);
    expect(ranked[0]?.toLowerCase()).toContain("spirit");
  });

  it("returns empty for garbage-only OCR", () => {
    expect(rankNameCandidates("###\n!!\n123")).toEqual([]);
  });
});
