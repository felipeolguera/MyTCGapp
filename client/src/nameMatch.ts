/** Normalize OCR / card names for fuzzy compare. */
export function normalizeCardName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  const cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = cur[j];
  }
  return prev[b.length];
}

/** 0–1 similarity; tolerant of plural/singular and OCR typos. */
export function nameSimilarity(ocrRaw: string, cardName: string): number {
  const a = normalizeCardName(ocrRaw);
  const b = normalizeCardName(cardName);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    return 0.82 + 0.18 * (shorter / longer);
  }
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  const ratio = 1 - dist / maxLen;

  // Token overlap helps “ghost pendragon” vs “ghosts of pendragon”.
  const at = new Set(a.split(" ").filter(Boolean));
  const bt = new Set(b.split(" ").filter(Boolean));
  let inter = 0;
  for (const t of at) if (bt.has(t)) inter += 1;
  const token =
    at.size && bt.size ? inter / Math.max(at.size, bt.size) : 0;

  return Math.max(0, Math.min(1, ratio * 0.65 + token * 0.35));
}

export interface NameRankedCard {
  name: string;
  score: number;
}

/** Rank unique card names by OCR similarity. */
export function rankNamesByOcr(
  ocrText: string,
  names: string[],
  opts: { minScore?: number; limit?: number } = {},
): NameRankedCard[] {
  const minScore = opts.minScore ?? 0.55;
  const limit = opts.limit ?? 8;
  const q = normalizeCardName(ocrText);
  if (q.length < 3) return [];

  const bestByName = new Map<string, number>();
  for (const name of names) {
    const score = nameSimilarity(q, name);
    if (score < minScore) continue;
    const prev = bestByName.get(name) ?? 0;
    if (score > prev) bestByName.set(name, score);
  }

  return [...bestByName.entries()]
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}
