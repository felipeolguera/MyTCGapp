import { describe, expect, it } from "vitest";
import {
  filterAndSortCollectionRows,
  matchesCollectionQuery,
  type CollectionListRow,
} from "./collectionQuery";
import type { GaCardEdition } from "./types";

function card(
  overrides: Partial<GaCardEdition> & Pick<GaCardEdition, "editionId" | "name">,
): GaCardEdition {
  return {
    cardId: "c",
    slug: "slug",
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
    setName: "Test Set",
    setPrefix: "TST",
    illustrator: null,
    ...overrides,
  };
}

function row(
  name: string,
  finish: "normal" | "foil",
  opts: {
    qty?: number;
    unit?: number | null;
    prefix?: string;
    num?: string;
    note?: string;
    binder?: string;
    page?: number | null;
    slot?: number | null;
  } = {},
): CollectionListRow {
  const editionId = `${name}-${finish}`;
  const entryCard = card({
    editionId,
    name,
    setPrefix: opts.prefix ?? "TST",
    collectorNumber: opts.num ?? "001",
  });
  const quantity = opts.qty ?? 1;
  const unit = opts.unit === undefined ? 1 : opts.unit;
  return {
    entry: {
      id: `${editionId}:${finish}`,
      editionId,
      finish,
      quantity,
      card: entryCard,
      updatedAt: "2026-01-01T00:00:00.000Z",
      forSale: false,
      condition: "NM",
      askingPrice: null,
      note: opts.note ?? "",
      binder: opts.binder ?? "",
      page: opts.page ?? null,
      slot: opts.slot ?? null,
    },
    unit,
    line: unit == null ? null : unit * quantity,
    url: null,
  };
}

describe("collectionQuery", () => {
  it("matches name, set code, collector number, and notes", () => {
    const entry = row("Spirit of Slime", "foil", {
      prefix: "ReC-SLM",
      num: "042",
      note: "Trade bait",
    }).entry;
    expect(matchesCollectionQuery(entry, "slime")).toBe(true);
    expect(matchesCollectionQuery(entry, "rec-slm")).toBe(true);
    expect(matchesCollectionQuery(entry, "042")).toBe(true);
    expect(matchesCollectionQuery(entry, "trade")).toBe(true);
    expect(matchesCollectionQuery(entry, "dragon")).toBe(false);
  });

  it("filters foil-only and sorts by price desc", () => {
    const rows = [
      row("Alpha", "normal", { unit: 10, qty: 1 }),
      row("Bravo", "foil", { unit: 3, qty: 2 }),
      row("Charlie", "foil", { unit: 9, qty: 1 }),
    ];
    const result = filterAndSortCollectionRows(rows, {
      query: "",
      finish: "foil",
      sale: "all",
      sort: "price-desc",
    });
    expect(result.map((r) => r.entry.card.name)).toEqual(["Charlie", "Bravo"]);
  });

  it("filters by set prefix", () => {
    const rows = [
      row("Alpha", "normal", { prefix: "AMB" }),
      row("Bravo", "foil", { prefix: "ReC-SLM" }),
    ];
    const result = filterAndSortCollectionRows(rows, {
      query: "",
      finish: "all",
      sale: "all",
      setPrefix: "AMB",
      sort: "name",
    });
    expect(result.map((r) => r.entry.card.name)).toEqual(["Alpha"]);
  });

  it("matches binder location and sorts by location", () => {
    const rows = [
      row("Zed", "normal", { binder: "Trade", page: 2, slot: 1 }),
      row("Alpha", "foil", { binder: "Main", page: 1, slot: 9 }),
      row("Bravo", "normal", { binder: "Main", page: 1, slot: 2 }),
    ];
    expect(matchesCollectionQuery(rows[0].entry, "trade")).toBe(true);
    expect(matchesCollectionQuery(rows[1].entry, "p1")).toBe(true);
    const result = filterAndSortCollectionRows(rows, {
      query: "",
      finish: "all",
      sale: "all",
      binder: "Main",
      sort: "location",
    });
    expect(result.map((r) => r.entry.card.name)).toEqual(["Bravo", "Alpha"]);
  });
});
