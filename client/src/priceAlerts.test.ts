import { describe, expect, it, beforeEach } from "vitest";
import {
  buildPriceSnapshot,
  computePriceMovers,
  evaluatePriceAlerts,
  formatMoverLine,
  type PricedOwnedRow,
} from "./priceAlerts";
import type { CollectionEntry, GaCardEdition } from "./types";

const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => memory.set(k, v),
    removeItem: (k: string) => memory.delete(k),
    clear: () => memory.clear(),
  },
  configurable: true,
});

const card: GaCardEdition = {
  editionId: "ed-1",
  cardId: "c-1",
  name: "Spirit of Slime",
  slug: "spirit",
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
  setPrefix: "ReC-SLM",
  illustrator: null,
};

function entry(): CollectionEntry {
  return {
    id: "ed-1:normal",
    editionId: "ed-1",
    finish: "normal",
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
  };
}

function row(market: number | null): PricedOwnedRow {
  return { entry: entry(), market };
}

describe("priceAlerts", () => {
  beforeEach(() => memory.clear());

  it("flags movers above threshold", () => {
    const snapshot = buildPriceSnapshot([row(10)]);
    const movers = computePriceMovers([row(12)], snapshot, 15);
    expect(movers).toHaveLength(1);
    expect(movers[0].changePercent).toBe(20);
  });

  it("ignores small moves", () => {
    const snapshot = buildPriceSnapshot([row(10)]);
    expect(computePriceMovers([row(10.5)], snapshot, 15)).toHaveLength(0);
  });

  it("baselines on first evaluate then alerts on second", () => {
    const first = evaluatePriceAlerts([row(10)], 15);
    expect(first.firstBaseline).toBe(true);
    expect(first.movers).toHaveLength(0);

    const second = evaluatePriceAlerts([row(13)], 15);
    expect(second.firstBaseline).toBe(false);
    expect(second.movers).toHaveLength(1);
    expect(formatMoverLine(second.movers[0])).toContain("Spirit of Slime");
  });
});
