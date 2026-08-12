import { describe, expect, it } from "vitest";
import {
  buildSaleReceipt,
  formatLedgerSummary,
  recordSale,
  readSalesLedger,
  clearSalesLedger,
  sessionRevenue,
  type SaleLine,
} from "./salesLedger";

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

const line: SaleLine = {
  entryId: "ed:normal",
  name: "Spirit of Slime",
  finish: "normal",
  condition: "NM",
  setCode: "ReC-SLM-001",
  quantity: 2,
  unitPrice: 5,
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
});
