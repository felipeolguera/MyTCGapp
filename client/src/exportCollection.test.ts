import { describe, expect, it } from "vitest";
import {
  buildCollectionCsv,
  buildCollectionShareText,
  type ExportRow,
} from "./exportCollection";
import type { GaCardEdition } from "./types";

const card: GaCardEdition = {
  editionId: "ed-1",
  cardId: "c-1",
  name: 'Spirit of "Slime"',
  slug: "spirit-of-slime",
  types: ["CHAMPION"],
  classes: [],
  element: "NORM",
  elements: ["NORM"],
  costMemory: 0,
  costReserve: null,
  level: 0,
  life: 15,
  power: null,
  effect: null,
  rarity: 1,
  collectorNumber: "001",
  imagePath: "/x.jpg",
  imageUrl: "https://example.com/x.jpg",
  setName: "Re:Collection Slime",
  setPrefix: "ReC-SLM",
  illustrator: null,
};

const foilRow: ExportRow = {
  entry: {
    id: "ed-1:foil",
    editionId: "ed-1",
    finish: "foil",
    quantity: 2,
    card,
    updatedAt: "2026-01-01T00:00:00.000Z",
    forSale: false,
    condition: "NM",
    askingPrice: null,
    note: "",
    binder: "",
    page: null,
    slot: null,
  },
  unit: 4.5,
  line: 9,
  url: "https://www.tcgplayer.com/product/1",
};

const normalRow: ExportRow = {
  entry: {
    id: "ed-1:normal",
    editionId: "ed-1",
    finish: "normal",
    quantity: 3,
    card,
    updatedAt: "2026-01-01T00:00:00.000Z",
    forSale: false,
    condition: "NM",
    askingPrice: null,
    note: "",
    binder: "",
    page: null,
    slot: null,
  },
  unit: 1.25,
  line: 3.75,
  url: "https://www.tcgplayer.com/product/1",
};

const totals = {
  cards: 5,
  unique: 2,
  market: 12.75,
  priced: 2,
};

describe("exportCollection", () => {
  it("builds CSV with finish labels, sorted rows, and TOTAL", () => {
    const csv = buildCollectionCsv([foilRow, normalRow], totals);
    expect(csv).toContain(
      "Card name,Code,Unit price,Total quantity,Total price",
    );
    expect(csv).toContain('"Spirit of ""Slime"" (N) NM"');
    expect(csv).toContain('"Spirit of ""Slime"" (F) NM"');
    expect(csv).toContain("ReC-SLM-001,1.25,(3pcs),3.75");
    expect(csv).toContain("ReC-SLM-001,4.50,(2pcs),9.00");
    expect(csv).toContain("TOTAL,,,(5pcs),12.75");
    // Normal before Foil when names/codes match
    expect(csv.indexOf("(N)")).toBeLessThan(csv.indexOf("(F)"));
  });

  it("builds share text with clear finishes and TOTAL footer", () => {
    const text = buildCollectionShareText([foilRow, normalRow], totals);
    expect(text).toContain(
      "Card name | Code | Unit price | Total quantity | Total price",
    );
    expect(text).toContain(
      'Spirit of "Slime" (N) NM | ReC-SLM-001 | $1.25 | (3pcs) | $3.75',
    );
    expect(text).toContain(
      'Spirit of "Slime" (F) NM | ReC-SLM-001 | $4.50 | (2pcs) | $9.00',
    );
    expect(text).toContain("TOTAL |  |  | (5pcs) | $12.75");
    expect(text).toContain("TCGPlayer market estimates");
  });
});
