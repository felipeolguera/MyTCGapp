/**
 * Build a perceptual-hash index of all Grand Archive card editions.
 * Uses the same RGBA→hash path as the app (client/src/phash.ts).
 * Run: npm run index:cards
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  hashesFromRgba,
} from "../src/phash.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../public/ga-card-index.json");
const GATCG = "https://api.gatcg.com";
const UA = "ArchiveBinderIndex/1.0 (+https://github.com/felipeolguera/MyTCGapp)";
const CONCURRENCY = 24;

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function hashImageBuffer(buf) {
  const { data, info } = await sharp(buf)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // sharp raw is Buffer; hashesFromRgba accepts Uint8Array
  return hashesFromRgba(new Uint8Array(data), info.width, info.height);
}

async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return out;
}

async function listAllEditions() {
  const editions = [];
  let page = 1;
  for (;;) {
    const url = `${GATCG}/cards/search?page_size=50&page=${page}`;
    const body = await fetchJson(url);
    const cards = body.data ?? [];
    for (const card of cards) {
      const eds = card.result_editions ?? card.editions ?? [];
      for (const ed of eds) {
        if (!ed?.uuid || !ed?.image) continue;
        const imagePath = ed.image.startsWith("/")
          ? ed.image
          : `/cards/images/${ed.image}`;
        editions.push({
          editionId: ed.uuid,
          cardId: card.uuid,
          name: card.name,
          slug: ed.slug || card.slug,
          types: card.types ?? [],
          classes: card.classes ?? [],
          element: card.element ?? null,
          elements: card.elements ?? [],
          costMemory: card.cost_memory ?? null,
          costReserve: card.cost_reserve ?? null,
          level: card.level ?? null,
          life: card.life ?? null,
          power: card.power ?? null,
          effect: card.effect ?? null,
          rarity: ed.rarity,
          collectorNumber: ed.collector_number,
          imagePath,
          imageUrl: `${GATCG}${imagePath}`,
          setName: ed.set?.name ?? "Unknown set",
          setPrefix: ed.set?.prefix ?? "",
          illustrator: ed.illustrator ?? null,
        });
      }
    }
    process.stdout.write(
      `\rListed page ${page}/${body.total_pages ?? "?"} → ${editions.length} editions`,
    );
    if (!body.has_more) break;
    page += 1;
  }
  process.stdout.write("\n");
  return editions;
}

async function main() {
  console.log("Fetching Grand Archive catalog…");
  const editions = await listAllEditions();
  console.log(
    `Hashing ${editions.length} edition images (concurrency ${CONCURRENCY})…`,
  );

  let done = 0;
  let failed = 0;
  const cards = await mapPool(editions, CONCURRENCY, async (ed) => {
    try {
      const buf = await fetchBuffer(ed.imageUrl);
      const hashes = await hashImageBuffer(buf);
      done += 1;
      if (done % 50 === 0 || done === editions.length) {
        process.stdout.write(
          `\rHashed ${done}/${editions.length} (fail ${failed})`,
        );
      }
      return { ...ed, dHash: hashes.dHash, aHash: hashes.aHash };
    } catch {
      failed += 1;
      done += 1;
      process.stdout.write(
        `\rHashed ${done}/${editions.length} (fail ${failed})`,
      );
      return null;
    }
  });

  process.stdout.write("\n");
  const index = {
    version: 1,
    algorithm: "dhash+ahash-64",
    generatedAt: new Date().toISOString(),
    total: 0,
    cards: cards.filter(Boolean),
  };
  index.total = index.cards.length;

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(index));
  console.log(`Wrote ${OUT} (${index.total} cards, ${failed} failed)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
