import type { CardFinish, CollectionEntry } from "./types";

export type CollectionSort =
  | "name"
  | "set"
  | "price-desc"
  | "price-asc"
  | "qty-desc";

export type CollectionFinishFilter = "all" | CardFinish;
export type CollectionSaleFilter = "all" | "for-sale" | "keep";

export interface CollectionListRow {
  entry: CollectionEntry;
  unit: number | null;
  line: number | null;
  url: string | null;
  market?: number | null;
}

export function matchesCollectionQuery(
  entry: CollectionEntry,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    entry.card.name,
    entry.card.setPrefix,
    entry.card.setName,
    entry.card.collectorNumber,
    entry.condition,
    entry.note ?? "",
    `${entry.card.setPrefix}-${entry.card.collectorNumber}`,
    `${entry.card.setPrefix} ${entry.card.collectorNumber}`,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

/** Unique set prefixes present in the binder, A→Z. */
export function listCollectionSetPrefixes(
  entries: CollectionEntry[],
): string[] {
  const prefixes = new Set<string>();
  for (const entry of entries) {
    const prefix = entry.card.setPrefix?.trim();
    if (prefix) prefixes.add(prefix);
  }
  return [...prefixes].sort((a, b) => a.localeCompare(b));
}

export function filterAndSortCollectionRows(
  rows: CollectionListRow[],
  options: {
    query: string;
    finish: CollectionFinishFilter;
    sale: CollectionSaleFilter;
    setPrefix?: string | "all";
    sort: CollectionSort;
  },
): CollectionListRow[] {
  const setPrefix = options.setPrefix ?? "all";
  const filtered = rows.filter(({ entry }) => {
    if (options.finish !== "all" && entry.finish !== options.finish) {
      return false;
    }
    if (options.sale === "for-sale" && !entry.forSale) return false;
    if (options.sale === "keep" && entry.forSale) return false;
    if (setPrefix !== "all" && entry.card.setPrefix !== setPrefix) {
      return false;
    }
    return matchesCollectionQuery(entry, options.query);
  });

  return [...filtered].sort((a, b) => {
    switch (options.sort) {
      case "set": {
        const set =
          a.entry.card.setPrefix.localeCompare(b.entry.card.setPrefix) ||
          a.entry.card.collectorNumber.localeCompare(
            b.entry.card.collectorNumber,
          );
        if (set) return set;
        break;
      }
      case "price-desc": {
        const av = a.line ?? -1;
        const bv = b.line ?? -1;
        if (bv !== av) return bv - av;
        break;
      }
      case "price-asc": {
        const av = a.line == null ? Number.POSITIVE_INFINITY : a.line;
        const bv = b.line == null ? Number.POSITIVE_INFINITY : b.line;
        if (av !== bv) return av - bv;
        break;
      }
      case "qty-desc": {
        if (b.entry.quantity !== a.entry.quantity) {
          return b.entry.quantity - a.entry.quantity;
        }
        break;
      }
      case "name":
      default:
        break;
    }

    const name = a.entry.card.name.localeCompare(b.entry.card.name);
    if (name) return name;
    if (a.entry.finish === b.entry.finish) return 0;
    return a.entry.finish === "normal" ? -1 : 1;
  });
}
