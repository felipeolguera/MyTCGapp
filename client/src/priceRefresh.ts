import type { PriceIndex, PriceRow } from "./prices";
import { normalizeCollector, normalizeNameKey } from "./prices";
import { writeCachedPriceIndex } from "./priceStore";

const CATEGORY_ID = 74;
const BASE = `https://tcgcsv.com/tcgplayer/${CATEGORY_ID}`;
const UA = "ArchiveBinder/1.0 (+https://github.com/felipeolguera/MyTCGapp)";
const CONCURRENCY = 4;

export type PriceRefreshProgress = {
  done: number;
  total: number;
  label: string;
};

type TcgGroup = {
  groupId: number;
  name: string;
  abbreviation?: string | null;
};

type TcgProduct = {
  productId: number;
  name: string;
  url?: string;
  extendedData?: Array<{ name?: string; displayName?: string; value?: string }>;
};

type TcgPrice = {
  productId: number;
  marketPrice?: number | null;
  lowPrice?: number | null;
  midPrice?: number | null;
  highPrice?: number | null;
  subTypeName?: string | null;
};

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`TCGCSV ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

function extValue(
  extendedData: TcgProduct["extendedData"],
  name: string,
): string | null {
  const hit = (extendedData ?? []).find(
    (e) => e.name === name || e.displayName === name,
  );
  return hit?.value ?? null;
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      out[i] = await worker(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => run()),
  );
  return out;
}

/**
 * Pull a fresh Grand Archive price index from TCGCSV and cache it on-device.
 */
export async function refreshPriceIndexFromTcgcsv(
  onProgress?: (progress: PriceRefreshProgress) => void,
): Promise<PriceIndex> {
  onProgress?.({ done: 0, total: 1, label: "Fetching sets…" });
  const groupsBody = await fetchJson<{ results?: TcgGroup[] }>(
    `${BASE}/groups`,
  );
  const groups = groupsBody.results ?? [];
  if (!groups.length) {
    throw new Error("TCGCSV returned no Grand Archive sets");
  }

  const chunkEntries = await mapPool(groups, CONCURRENCY, async (group, i) => {
    onProgress?.({
      done: i,
      total: groups.length,
      label: group.abbreviation || group.name,
    });
    const [productsBody, pricesBody] = await Promise.all([
      fetchJson<{ results?: TcgProduct[] }>(
        `${BASE}/${group.groupId}/products`,
      ),
      fetchJson<{ results?: TcgPrice[] }>(`${BASE}/${group.groupId}/prices`),
    ]);
    const products = productsBody.results ?? [];
    const prices = pricesBody.results ?? [];
    const priceByProduct = new Map<number, TcgPrice[]>();
    for (const p of prices) {
      const list = priceByProduct.get(p.productId) ?? [];
      list.push(p);
      priceByProduct.set(p.productId, list);
    }

    const rows: PriceRow[] = [];
    for (const product of products) {
      const number = normalizeCollector(
        extValue(product.extendedData, "Number") ?? "",
      );
      if (!number && !extValue(product.extendedData, "CardType")) continue;
      const name = product.name;
      const variants = priceByProduct.get(product.productId) ?? [];
      const url =
        product.url ??
        `https://www.tcgplayer.com/product/${product.productId}`;
      if (variants.length === 0) {
        rows.push({
          productId: product.productId,
          name,
          nameKey: normalizeNameKey(name),
          number,
          groupId: group.groupId,
          groupName: group.name,
          groupAbbr: group.abbreviation ?? "",
          printing: "Normal",
          market: null,
          low: null,
          mid: null,
          high: null,
          url,
        });
        continue;
      }
      for (const v of variants) {
        rows.push({
          productId: product.productId,
          name,
          nameKey: normalizeNameKey(name),
          number,
          groupId: group.groupId,
          groupName: group.name,
          groupAbbr: group.abbreviation ?? "",
          printing: v.subTypeName || "Normal",
          market: v.marketPrice ?? null,
          low: v.lowPrice ?? null,
          mid: v.midPrice ?? null,
          high: v.highPrice ?? null,
          url,
        });
      }
    }
    return rows;
  });

  const entries = chunkEntries.flat();
  const index: PriceIndex = {
    version: 1,
    source: "tcgcsv.com (live refresh)",
    categoryId: CATEGORY_ID,
    generatedAt: new Date().toISOString(),
    total: entries.length,
    entries,
  };
  await writeCachedPriceIndex(index);
  onProgress?.({
    done: groups.length,
    total: groups.length,
    label: "Saved",
  });
  return index;
}
