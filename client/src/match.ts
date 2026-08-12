import type { GaCardEdition } from "./types";

/** Words that commonly appear on GA cards but are not card names. */
const STOP_PHRASES = [
  "on enter",
  "on attack",
  "on death",
  "inherited effect",
  "floating memory",
  "reserve",
  "memory",
  "champion",
  "ally",
  "action",
  "item",
  "weapon",
  "domain",
  "regalia",
  "attack",
  "level",
  "power",
  "life",
  "durability",
  "class bonus",
  "rested",
  "awaken",
  "materialize",
  "interception",
  "fast",
  "slow",
  "norm",
  "fire",
  "water",
  "wind",
  "arcane",
  "luxem",
  "umbra",
  "exia",
  "terra",
  "basic",
  "unique",
  "token",
];

const STOP_WORDS = new Set(
  STOP_PHRASES.flatMap((p) => p.split(" ")).concat([
    "the",
    "and",
    "for",
    "with",
    "from",
    "into",
    "your",
    "this",
    "that",
    "when",
    "then",
    "card",
    "cards",
    "draw",
    "deal",
    "damage",
    "target",
    "unit",
    "units",
  ]),
);

export function normalizeQuery(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9' -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isWeakNameQuery(text: string): boolean {
  const n = normalizeQuery(text);
  if (n.length < 5) return true;
  if (STOP_PHRASES.includes(n)) return true;
  const words = n.split(" ").filter(Boolean);
  // Single short tokens like "Spirit" match dozens of cards on GATCG.
  if (words.length === 1) return words[0].length < 10;
  if (words.every((w) => STOP_WORDS.has(w) || w.length <= 2)) return true;
  const content = words.filter((w) => !STOP_WORDS.has(w) && w.length > 2);
  return content.length === 0;
}

/** Dice coefficient on bigrams — good for OCR typos. */
export function stringSimilarity(a: string, b: string): number {
  const left = normalizeQuery(a).replace(/ /g, "");
  const right = normalizeQuery(b).replace(/ /g, "");
  if (!left || !right) return 0;
  if (left === right) return 1;

  if (left.length < 2 || right.length < 2) {
    return left === right ? 1 : 0;
  }

  const bigrams = (s: string) => {
    const map = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      map.set(g, (map.get(g) ?? 0) + 1);
    }
    return map;
  };

  const A = bigrams(left);
  const B = bigrams(right);
  let overlap = 0;
  for (const [g, count] of A) {
    overlap += Math.min(count, B.get(g) ?? 0);
  }
  return (2 * overlap) / (left.length - 1 + (right.length - 1));
}

export function tokenOverlap(query: string, name: string): number {
  const q = new Set(
    normalizeQuery(query)
      .split(" ")
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
  const n = new Set(
    normalizeQuery(name)
      .split(" ")
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
  if (q.size === 0 || n.size === 0) return 0;
  let hit = 0;
  for (const t of q) if (n.has(t)) hit += 1;
  return hit / Math.max(q.size, n.size);
}

export function scoreCardMatch(query: string, card: GaCardEdition): number {
  const qNorm = normalizeQuery(query);
  const nNorm = normalizeQuery(card.name);
  const nameScore = stringSimilarity(query, card.name);
  const tokenScore = tokenOverlap(query, card.name);
  const exact = qNorm === nNorm ? 1 : 0;
  const starts = nNorm.startsWith(qNorm) && qNorm.length >= 6 ? 0.12 : 0;

  const qTokens = qNorm
    .split(" ")
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  const nTokens = new Set(
    nNorm.split(" ").filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
  const missing =
    qTokens.length === 0
      ? 1
      : qTokens.filter((t) => !nTokens.has(t)).length / qTokens.length;

  const raw =
    exact * 1 + nameScore * 0.55 + tokenScore * 0.35 + starts - missing * 0.4;
  return Math.max(0, Math.min(1, raw));
}

export interface RankedCard {
  card: GaCardEdition;
  score: number;
  query: string;
}

/**
 * Keep only strong matches, prefer unique cards, cap list size.
 * One edition per cardId (best scoring edition).
 */
export function rankAndFilterMatches(
  query: string,
  cards: GaCardEdition[],
  opts: { minScore?: number; limit?: number } = {},
): RankedCard[] {
  const minScore = opts.minScore ?? 0.42;
  const limit = opts.limit ?? 8;

  const ranked = cards
    .map((card) => ({ card, score: scoreCardMatch(query, card), query }))
    .filter((r) => r.score >= minScore)
    .sort((a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name));

  const byCard = new Map<string, RankedCard>();
  for (const row of ranked) {
    const existing = byCard.get(row.card.cardId);
    if (!existing || row.score > existing.score) {
      byCard.set(row.card.cardId, row);
    }
  }

  return [...byCard.values()]
    .sort((a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name))
    .slice(0, limit);
}

export interface SetCodeHit {
  prefix: string;
  collectorNumber: string;
}

/** Parse GA-style set codes like "ReC-SLM 001", "AMB-012", "P24 #68". */
export function extractSetCodes(text: string): SetCodeHit[] {
  const hits: SetCodeHit[] = [];
  const re =
    /\b([A-Z]{1,4}(?:-[A-Z]{2,5})?)\s*[#:]?\s*0*(\d{1,3})\b/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const prefix = match[1];
    const collectorNumber = match[2].padStart(3, "0");
    // Skip obvious false positives
    if (["ON", "AT", "LV", "HP", "MP"].includes(prefix.toUpperCase())) continue;
    if (
      !hits.some(
        (h) =>
          h.prefix.toUpperCase() === prefix.toUpperCase() &&
          h.collectorNumber === collectorNumber,
      )
    ) {
      hits.push({ prefix, collectorNumber });
    }
  }
  return hits.slice(0, 3);
}
