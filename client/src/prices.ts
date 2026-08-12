import type { GaCardEdition } from "./types";

export interface PriceRow {
  productId: number;
  name: string;
  nameKey: string;
  number: string;
  groupId: number;
  groupName: string;
  groupAbbr: string;
  printing: string;
  market: number | null;
  low: number | null;
  mid: number | null;
  high: number | null;
  url: string;
}

export interface PriceIndex {
  version: number;
  source: string;
  categoryId: number;
  generatedAt: string;
  total: number;
  entries: PriceRow[];
}

export interface CardPrice {
  market: number | null;
  low: number | null;
  mid: number | null;
  high: number | null;
  printing: string;
  productId: number;
  url: string;
  groupName: string;
  matchedName: string;
}

let cached: PriceIndex | null = null;
let loadPromise: Promise<PriceIndex> | null = null;

export function normalizeNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\(csr\)/gi, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCollector(num: string): string {
  const digits = String(num ?? "").replace(/^#/, "").match(/\d+/)?.[0];
  return digits ? digits.padStart(3, "0") : "";
}

/** Map GATCG set prefixes onto TCGPlayer group abbreviations. */
export function setPrefixCandidates(setPrefix: string): string[] {
  const raw = setPrefix.trim();
  if (!raw) return [];
  const upper = raw.toUpperCase();
  const out = new Set<string>([upper, upper.replace(/^REC-/, "")]);

  // Common GA → TCGPlayer abbreviation tweaks
  if (upper === "DOA" || upper.startsWith("DOA")) {
    out.add("DOA 1ST");
    out.add("DOA ALTER");
    out.add("DOAP");
  }
  if (upper.startsWith("P") && /^P\d{2}$/.test(upper)) {
    out.add("PROMO");
    out.add(upper);
  }
  return [...out];
}

export async function loadPriceIndex(): Promise<PriceIndex> {
  if (cached) return cached;
  if (!loadPromise) {
    loadPromise = (async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}ga-price-index.json`);
      if (!res.ok) {
        throw new Error("TCGPlayer price index missing — run npm run index:prices");
      }
      const data = (await res.json()) as PriceIndex;
      cached = data;
      return data;
    })();
  }
  return loadPromise;
}

function abbrScore(cardPrefix: string, groupAbbr: string): number {
  const candidates = setPrefixCandidates(cardPrefix).map((c) =>
    c.replace(/\s+/g, "").toUpperCase(),
  );
  const abbr = groupAbbr.replace(/\s+/g, "").toUpperCase();
  if (!abbr) return 0;
  if (candidates.includes(abbr)) return 3;
  if (candidates.some((c) => c.includes(abbr) || abbr.includes(c))) return 2;
  return 0;
}

/**
 * Find the best TCGPlayer market price for a GA edition.
 * Prefers Normal printing; falls back to any printing with a market price.
 */
export function lookupCardPrice(
  index: PriceIndex,
  card: Pick<GaCardEdition, "name" | "collectorNumber" | "setPrefix">,
  preferredPrinting = "Normal",
): CardPrice | null {
  const nameKey = normalizeNameKey(card.name);
  const number = normalizeCollector(card.collectorNumber);
  if (!nameKey) return null;

  let candidates = index.entries.filter((e) => e.nameKey === nameKey);
  if (number) {
    const withNumber = candidates.filter((e) => e.number === number);
    if (withNumber.length) candidates = withNumber;
  }
  if (!candidates.length) return null;

  candidates = [...candidates].sort((a, b) => {
    const setDiff =
      abbrScore(card.setPrefix, b.groupAbbr) -
      abbrScore(card.setPrefix, a.groupAbbr);
    if (setDiff) return setDiff;
    const printPref =
      Number(b.printing === preferredPrinting) -
      Number(a.printing === preferredPrinting);
    if (printPref) return printPref;
    const marketA = a.market ?? -1;
    const marketB = b.market ?? -1;
    return marketB - marketA;
  });

  const best = candidates[0];
  return {
    market: best.market,
    low: best.low,
    mid: best.mid,
    high: best.high,
    printing: best.printing,
    productId: best.productId,
    url: best.url,
    groupName: best.groupName,
    matchedName: best.name,
  };
}

export function formatUsd(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `$${value.toFixed(2)}`;
}
