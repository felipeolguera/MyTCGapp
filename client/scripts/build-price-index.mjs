/**
 * Build a TCGPlayer market-price index for Grand Archive via TCGCSV
 * (daily mirror of TCGplayer public catalog data — no API key required).
 *
 * Run: npm run index:prices
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../public/ga-price-index.json");
const CATEGORY_ID = 74;
const BASE = `https://tcgcsv.com/tcgplayer/${CATEGORY_ID}`;
const UA = "ArchiveBinderPrices/1.0 (+https://github.com/felipeolguera/MyTCGapp)";

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

function extValue(extendedData, name) {
  const hit = (extendedData ?? []).find(
    (e) => e.name === name || e.displayName === name,
  );
  return hit?.value ?? null;
}

function normalizeName(name) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/\(csr\)/gi, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNumber(num) {
  const raw = String(num ?? "").replace(/^#/, "").trim();
  const digits = raw.match(/\d+/)?.[0];
  if (!digits) return "";
  return digits.padStart(3, "0");
}

async function main() {
  console.log("Fetching Grand Archive TCGPlayer groups…");
  const groupsBody = await fetchJson(`${BASE}/groups`);
  const groups = groupsBody.results ?? [];
  console.log(`Found ${groups.length} groups`);

  const entries = [];
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    process.stdout.write(
      `\r[${i + 1}/${groups.length}] ${group.abbreviation || group.name}…`.padEnd(
        80,
        " ",
      ),
    );
    const [productsBody, pricesBody] = await Promise.all([
      fetchJson(`${BASE}/${group.groupId}/products`),
      fetchJson(`${BASE}/${group.groupId}/prices`),
    ]);
    const products = productsBody.results ?? [];
    const prices = pricesBody.results ?? [];
    const priceByProduct = new Map();
    for (const p of prices) {
      const list = priceByProduct.get(p.productId) ?? [];
      list.push(p);
      priceByProduct.set(p.productId, list);
    }

    for (const product of products) {
      const number = normalizeNumber(extValue(product.extendedData, "Number"));
      // Skip sealed product rows with no collector number.
      if (!number && !extValue(product.extendedData, "CardType")) continue;

      const name = product.name;
      const variants = priceByProduct.get(product.productId) ?? [];
      if (variants.length === 0) {
        entries.push({
          productId: product.productId,
          name,
          nameKey: normalizeName(name),
          number,
          groupId: group.groupId,
          groupName: group.name,
          groupAbbr: group.abbreviation ?? "",
          printing: "Normal",
          market: null,
          low: null,
          mid: null,
          high: null,
          url: product.url,
        });
        continue;
      }
      for (const v of variants) {
        entries.push({
          productId: product.productId,
          name,
          nameKey: normalizeName(name),
          number,
          groupId: group.groupId,
          groupName: group.name,
          groupAbbr: group.abbreviation ?? "",
          printing: v.subTypeName || "Normal",
          market: v.marketPrice ?? null,
          low: v.lowPrice ?? null,
          mid: v.midPrice ?? null,
          high: v.highPrice ?? null,
          url: product.url,
        });
      }
    }
  }

  process.stdout.write("\n");
  const index = {
    version: 1,
    source: "tcgcsv.com (TCGPlayer mirror)",
    categoryId: CATEGORY_ID,
    generatedAt: new Date().toISOString(),
    total: entries.length,
    entries,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(index));
  console.log(`Wrote ${OUT} (${entries.length} price rows)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
