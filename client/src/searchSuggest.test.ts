import { describe, expect, it } from "vitest";
import {
  suggestCollectionQueries,
  suggestionsFromCards,
} from "./searchSuggest";

const entries = [
  {
    id: "a:normal",
    note: "trade bait",
    binder: "Trade",
    page: 12,
    slot: 4,
    card: {
      name: "Spirit of Slime",
      setPrefix: "AMB",
      setName: "Ambleside",
      collectorNumber: "042",
    },
  },
  {
    id: "b:foil",
    binder: "Main",
    card: {
      name: "Alice, Distorted Queen",
      setPrefix: "DOA",
      setName: "Dawn of Ashes",
      collectorNumber: "001",
    },
  },
];

describe("searchSuggest", () => {
  it("suggests owned card names while typing", () => {
    const hits = suggestCollectionQueries(entries, "spir");
    expect(hits[0]?.primary).toBe("Spirit of Slime");
  });

  it("suggests set prefixes", () => {
    const hits = suggestCollectionQueries(entries, "doa");
    expect(hits.some((h) => h.primary === "DOA")).toBe(true);
  });

  it("suggests binder labels", () => {
    const hits = suggestCollectionQueries(entries, "tra");
    expect(hits.some((h) => h.primary === "Trade")).toBe(true);
  });

  it("builds card suggestion rows", () => {
    const rows = suggestionsFromCards([
      {
        editionId: "1",
        name: "Spirit of Slime",
        setPrefix: "AMB",
        collectorNumber: "042",
      },
    ]);
    expect(rows[0]?.primary).toBe("Spirit of Slime");
    expect(rows[0]?.secondary).toContain("AMB #042");
  });
});
