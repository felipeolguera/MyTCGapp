import { describe, expect, it } from "vitest";
import {
  buildSaleReceipt,
  canUndoSale,
  formatLedgerSummary,
  recordSale,
  readSalesLedger,
  clearSalesLedger,
  peekLastSale,
  popLastSale,
  sessionRevenue,
  type SaleLine,
} from "./salesLedger";
import type { GaCardEdition } from "./types";

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

const line: SaleLine = {
  entryId: "ed-1:normal",
  name: "Spirit of Slime",
  finish: "normal",
  condition: "NM",
  setCode: "ReC-SLM-001",
  quantity: 2,
  unitPrice: 5,
  card,
  forSale: true,
  askingPrice: 5,
  note: "",
};

describe("salesLedger", () => {
  it("records sales and sums today's revenue", () => {
    clearSalesLedger();
    recordSale([line], "checkout");
    expect(readSalesLedger()).toHaveLength(1);
    const rev = sessionRevenue(readSalesLedger());
    expect(rev.cards).toBe(2);
    expect(rev.total).toBe(10);
    expect(formatLedgerSummary(readSalesLedger())).toMatch(/Today/);
  });

  it("builds a multi-line receipt", () => {
    clearSalesLedger();
    const sale = recordSale([line], "sold-one");
    const text = buildSaleReceipt(sale);
    expect(text).toContain("Spirit of Slime (N) NM");
    expect(text).toContain("$10.00");
  });

  it("pops the last sale for undo", () => {
    clearSalesLedger();
    recordSale([line], "checkout");
    expect(canUndoSale(peekLastSale()!)).toBe(true);
    const popped = popLastSale();
    expect(popped?.cardCount).toBe(2);
    expect(readSalesLedger()).toHaveLength(0);
  });
});
