import { describe, expect, it } from "vitest";
import {
  lookupCardPrice,
  normalizeCollector,
  normalizeNameKey,
  setPrefixCandidates,
  type PriceIndex,
} from "./prices";

const index: PriceIndex = {
  version: 1,
  source: "test",
  categoryId: 74,
  generatedAt: "2026-01-01",
  total: 2,
  entries: [
    {
      productId: 1,
      name: "Spirit of Slime",
      nameKey: "spirit of slime",
      number: "001",
      groupId: 1,
      groupName: "Silvie Re:Collection, Slime Sovereign",
      groupAbbr: "SLM",
      printing: "Normal",
      market: 1.25,
      low: 0.5,
      mid: 1.0,
      high: 3.0,
      url: "https://www.tcgplayer.com/product/1",
    },
    {
      productId: 2,
      name: "Spirit of Slime",
      nameKey: "spirit of slime",
      number: "001",
      groupId: 2,
      groupName: "Other Set",
      groupAbbr: "XYZ",
      printing: "Normal",
      market: 9.99,
      low: 9,
      mid: 9,
      high: 9,
      url: "https://www.tcgplayer.com/product/2",
    },
  ],
};

describe("prices", () => {
  it("normalizes names and collector numbers", () => {
    expect(normalizeNameKey("Spirit of Slime (CSR)")).toBe("spirit of slime");
    expect(normalizeCollector("1")).toBe("001");
    expect(setPrefixCandidates("ReC-SLM")).toContain("SLM");
  });

  it("prefers matching set abbreviation", () => {
    const hit = lookupCardPrice(index, {
      name: "Spirit of Slime",
      collectorNumber: "001",
      setPrefix: "ReC-SLM",
    });
    expect(hit?.productId).toBe(1);
    expect(hit?.market).toBe(1.25);
  });
});
