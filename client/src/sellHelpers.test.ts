import { describe, expect, it } from "vitest";
import {
  buildAskingTotalClipboard,
  sumAskingTotal,
} from "./sellHelpers";
import type { CollectionListRow } from "./collectionQuery";
import type { GaCardEdition } from "./types";

const card: GaCardEdition = {
  editionId: "ed-1",
  cardId: "c-1",
  name: "Test Card",
  slug: "test",
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
  collectorNumber: "001",
  imagePath: "/x.jpg",
  imageUrl: "https://example.com/x.jpg",
  setName: "Set",
  setPrefix: "SET",
  illustrator: null,
};

function row(
  qty: number,
  unit: number | null,
  asking: number | null,
): CollectionListRow {
  return {
    entry: {
      id: `ed-${qty}:${asking}`,
      editionId: `ed-${qty}`,
      finish: "normal",
      quantity: qty,
      card,
      updatedAt: "2026-01-01T00:00:00.000Z",
      forSale: true,
      condition: "NM",
      askingPrice: asking,
      note: "",
    },
    unit,
    line: (asking ?? unit) != null ? (asking ?? unit)! * qty : null,
    url: null,
  };
}

describe("sellHelpers", () => {
  it("prefers asking price over market unit", () => {
    const rows = [row(2, 1, 5), row(3, 2, null)];
    expect(sumAskingTotal(rows)).toBe(2 * 5 + 3 * 2);
  });

  it("builds a clipboard listing line", () => {
    const text = buildAskingTotalClipboard([row(2, 1, 5)]);
    expect(text).toContain("(2pcs)");
    expect(text).toContain("$10.00");
  });
});
