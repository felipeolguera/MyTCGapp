import type { GaCardEdition } from "./types";
import {
  combinedDistance,
  distanceToScore,
  hashesFromRgba,
  type Hash64,
} from "./phash";

export interface IndexedCard extends GaCardEdition {
  dHash: Hash64;
  aHash: Hash64;
}

export interface CardIndex {
  version: number;
  algorithm: string;
  generatedAt: string;
  total: number;
  cards: IndexedCard[];
}

export interface VisualMatch {
  card: GaCardEdition;
  distance: number;
  score: number;
}

let cachedIndex: CardIndex | null = null;
let loadPromise: Promise<CardIndex> | null = null;

export async function loadCardIndex(): Promise<CardIndex> {
  if (cachedIndex) return cachedIndex;
  if (!loadPromise) {
    loadPromise = (async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}ga-card-index.json`);
      if (!res.ok) {
        throw new Error("Card image index missing — rebuild with npm run index:cards");
      }
      const data = (await res.json()) as CardIndex;
      cachedIndex = data;
      return data;
    })();
  }
  return loadPromise;
}

async function blobToRgba(blob: Blob): Promise<{
  data: Uint8ClampedArray;
  width: number;
  height: number;
}> {
  const bitmap =
    typeof createImageBitmap === "function"
      ? await createImageBitmap(blob)
      : await new Promise<HTMLImageElement>((resolve, reject) => {
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
          };
          img.onerror = reject;
          img.src = url;
        });

  const width =
    "width" in bitmap
      ? (bitmap as ImageBitmap).width
      : (bitmap as HTMLImageElement).naturalWidth;
  const height =
    "height" in bitmap
      ? (bitmap as ImageBitmap).height
      : (bitmap as HTMLImageElement).naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas unsupported");
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
  const image = ctx.getImageData(0, 0, width, height);
  return { data: image.data, width, height };
}

function toEdition(card: IndexedCard): GaCardEdition {
  return {
    editionId: card.editionId,
    cardId: card.cardId,
    name: card.name,
    slug: card.slug,
    types: card.types,
    classes: card.classes,
    element: card.element,
    elements: card.elements,
    costMemory: card.costMemory,
    costReserve: card.costReserve,
    level: card.level,
    life: card.life,
    power: card.power,
    effect: card.effect,
    rarity: card.rarity,
    collectorNumber: card.collectorNumber,
    imagePath: card.imagePath,
    imageUrl: card.imageUrl,
    setName: card.setName,
    setPrefix: card.setPrefix,
    illustrator: card.illustrator,
  };
}

/**
 * Match a snapped card photo against the precomputed GA image index.
 * Returns best visual matches (lower distance = better).
 */
export async function matchCardVisually(
  photo: Blob,
  opts: { limit?: number; maxDistance?: number } = {},
): Promise<VisualMatch[]> {
  const { data, width, height } = await blobToRgba(photo);
  return matchRgbaVisually(data, width, height, opts);
}

/** Match pre-decoded RGBA (used by page-grid cell crops). */
export async function matchRgbaVisually(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts: { limit?: number; maxDistance?: number } = {},
): Promise<VisualMatch[]> {
  const limit = opts.limit ?? 5;
  const maxDistance = opts.maxDistance ?? 42;
  const index = await loadCardIndex();
  const probe = hashesFromRgba(data, width, height);

  const ranked: VisualMatch[] = [];
  for (const card of index.cards) {
    const distance = combinedDistance(probe, card);
    if (distance > maxDistance) continue;
    ranked.push({
      card: toEdition(card),
      distance,
      score: distanceToScore(distance),
    });
  }

  ranked.sort(
    (a, b) =>
      a.distance - b.distance || a.card.name.localeCompare(b.card.name),
  );

  // Keep distinct printings (editionId) so reprints/set variants stay pickable.
  const byEdition = new Map<string, VisualMatch>();
  for (const row of ranked) {
    const existing = byEdition.get(row.card.editionId);
    if (!existing || row.distance < existing.distance) {
      byEdition.set(row.card.editionId, row);
    }
  }

  return [...byEdition.values()]
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

/** High-confidence visual hit: skip straight to confirm (Wrong still shows other matches). */
export function shouldAutoConfirm(matches: VisualMatch[]): boolean {
  if (matches.length === 0) return false;
  const best = matches[0];
  if (best.score < 0.78) return false;
  if (matches.length === 1) return true;
  const second = matches[1];
  // Same art, different set — force a pick.
  if (
    best.card.cardId === second.card.cardId &&
    best.score - second.score < 0.08
  ) {
    return false;
  }
  return best.score - second.score >= 0.06;
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Offline name/set/# search against the bundled visual index.
 * Prefer exact-ish name starts, then substring hits.
 */
export async function searchCardIndex(
  query: string,
  limit = 20,
): Promise<GaCardEdition[]> {
  const q = normalizeSearchText(query);
  if (!q) return [];
  const index = await loadCardIndex();

  type Hit = { card: IndexedCard; rank: number };
  const hits: Hit[] = [];
  for (const card of index.cards) {
    const name = normalizeSearchText(card.name);
    const prefix = normalizeSearchText(card.setPrefix);
    const num = normalizeSearchText(card.collectorNumber);
    const setName = normalizeSearchText(card.setName);
    let rank = -1;
    if (name === q) rank = 0;
    else if (name.startsWith(q)) rank = 1;
    else if (name.includes(q)) rank = 2;
    else if (`${prefix} ${num}`.includes(q) || `${prefix}-${num}`.includes(q))
      rank = 3;
    else if (prefix.includes(q) || num.includes(q) || setName.includes(q))
      rank = 4;
    if (rank < 0) continue;
    hits.push({ card, rank });
  }

  hits.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.card.name.localeCompare(b.card.name) ||
      a.card.setPrefix.localeCompare(b.card.setPrefix),
  );

  // Distinct printings — sellers often need the right set, not just the name.
  const seen = new Set<string>();
  const out: GaCardEdition[] = [];
  for (const hit of hits) {
    if (seen.has(hit.card.editionId)) continue;
    seen.add(hit.card.editionId);
    out.push(toEdition(hit.card));
    if (out.length >= limit) break;
  }
  return out;
}
