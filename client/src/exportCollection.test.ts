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

const rows: ExportRow[] = [
  {
    entry: {
      id: "ed-1:foil",
      editionId: "ed-1",
      finish: "foil",
      quantity: 2,
      card,
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    unit: 4.5,
    line: 9,
    url: "https://www.tcgplayer.com/product/1",
  },
];

describe("exportCollection", () => {
  it("builds CSV with card name, code, unit price, qty, total", () => {
    const csv = buildCollectionCsv(rows);
    expect(csv).toContain(
      "Card name,Code,Unit price,Total quantity,Total price",
    );
    expect(csv).toContain('"Spirit of ""Slime"" (Foil)"');
    expect(csv).toContain("ReC-SLM-001,4.50,2,9.00");
  });

  it("builds a shareable inventory with the same columns", () => {
    const text = buildCollectionShareText(rows, {
      cards: 2,
      unique: 1,
      market: 9,
      priced: 1,
    });
    expect(text).toContain(
      "Card name | Code | Unit price | Total quantity | Total price",
    );
    expect(text).toContain(
      'Spirit of "Slime" (Foil) | ReC-SLM-001 | $4.50 | 2 | $9.00',
    );
  });
});
