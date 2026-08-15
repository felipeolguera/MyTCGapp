import type { CardFinish, GaCardEdition } from "./types";
import { normalizeCardName, nameSimilarity } from "./nameMatch";
import { loadCardIndex, type IndexedCard } from "./visualMatch";
import {
  finishToPrinting,
  lookupCardPrice,
  type PriceIndex,
} from "./prices";
import type { DecklistLine, ParsedDecklist } from "./decklistParse";

export type DecklistResolveStatus = "matched" | "fuzzy" | "unmatched";

export interface ResolvedDecklistLine {
  source: DecklistLine;
  status: DecklistResolveStatus;
  /** Best card edition when matched/fuzzy. */
  card: GaCardEdition | null;
  /** Similarity 0–1 for fuzzy/matched. */
  score: number;
  /** Alternate candidates (same name, other printings) when useful. */
  alternates: GaCardEdition[];
}

export interface DecklistResolveResult {
  binderName: string;
  lines: ResolvedDecklistLine[];
  matchedCount: number;
  unmatchedCount: number;
  totalCards: number;
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

/** Prefer a representative printing: lowest rarity, then set prefix, then number. */
function pickPreferredEdition(cards: IndexedCard[]): IndexedCard {
  return [...cards].sort(
    (a, b) =>
      a.rarity - b.rarity ||
      a.setPrefix.localeCompare(b.setPrefix) ||
      a.collectorNumber.localeCompare(b.collectorNumber, undefined, {
        numeric: true,
      }),
  )[0];
}

function editionsForName(
  byName: Map<string, IndexedCard[]>,
  name: string,
): GaCardEdition[] {
  const rows = byName.get(normalizeCardName(name)) ?? [];
  return rows.map(toEdition);
}

/**
 * Resolve parsed decklist lines against the offline GA card index.
 * Exact normalized name wins; otherwise fuzzy ≥ minScore.
 */
export async function resolveDecklist(
  parsed: ParsedDecklist,
  opts: { binderName?: string; minFuzzyScore?: number } = {},
): Promise<DecklistResolveResult> {
  const minFuzzy = opts.minFuzzyScore ?? 0.82;
  const index = await loadCardIndex();
  const byName = new Map<string, IndexedCard[]>();
  for (const card of index.cards) {
    const key = normalizeCardName(card.name);
    const list = byName.get(key);
    if (list) list.push(card);
    else byName.set(key, [card]);
  }
  const uniqueNames = [...byName.keys()];

  const lines: ResolvedDecklistLine[] = parsed.lines.map((source) => {
    const key = normalizeCardName(source.name);
    const exact = byName.get(key);
    if (exact?.length) {
      const preferred = pickPreferredEdition(exact);
      return {
        source,
        status: "matched" as const,
        card: toEdition(preferred),
        score: 1,
        alternates: editionsForName(byName, preferred.name).filter(
          (c) => c.editionId !== preferred.editionId,
        ),
      };
    }

    let bestName = "";
    let bestScore = 0;
    for (const candidate of uniqueNames) {
      const score = nameSimilarity(source.name, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestName = candidate;
      }
    }

    if (bestScore >= minFuzzy && bestName) {
      const rows = byName.get(bestName) ?? [];
      const preferred = pickPreferredEdition(rows);
      return {
        source,
        status: "fuzzy" as const,
        card: toEdition(preferred),
        score: bestScore,
        alternates: editionsForName(byName, preferred.name).filter(
          (c) => c.editionId !== preferred.editionId,
        ),
      };
    }

    return {
      source,
      status: "unmatched" as const,
      card: null,
      score: bestScore,
      alternates: [],
    };
  });

  const matchedCount = lines.filter((l) => l.card).length;
  return {
    binderName: (opts.binderName?.trim() || parsed.title).slice(0, 40),
    lines,
    matchedCount,
    unmatchedCount: lines.length - matchedCount,
    totalCards: lines.reduce((sum, l) => sum + l.source.quantity, 0),
  };
}

export interface DecklistWorthLine {
  name: string;
  sourceName: string;
  quantity: number;
  section: string;
  unit: number | null;
  line: number | null;
  status: DecklistResolveStatus;
  card: GaCardEdition | null;
}

export interface DecklistWorth {
  lines: DecklistWorthLine[];
  /** Sum of priced lines (missing prices count as 0). */
  total: number;
  pricedCards: number;
  unpricedCards: number;
  unmatchedCards: number;
}

/** Estimate USD worth from resolved lines + price index (Normal finish). */
export function estimateDecklistWorth(
  resolved: DecklistResolveResult,
  priceIndex: PriceIndex | null,
  finish: CardFinish = "normal",
): DecklistWorth {
  const printing = finishToPrinting(finish);
  let total = 0;
  let pricedCards = 0;
  let unpricedCards = 0;
  let unmatchedCards = 0;

  const lines: DecklistWorthLine[] = resolved.lines.map((row) => {
    if (!row.card) {
      unmatchedCards += row.source.quantity;
      return {
        name: row.source.name,
        sourceName: row.source.name,
        quantity: row.source.quantity,
        section: row.source.section,
        unit: null,
        line: null,
        status: row.status,
        card: null,
      };
    }
    const price = priceIndex
      ? lookupCardPrice(priceIndex, row.card, printing)
      : null;
    const unit = price?.market ?? null;
    const line = unit != null ? unit * row.source.quantity : null;
    if (line != null) {
      total += line;
      pricedCards += row.source.quantity;
    } else {
      unpricedCards += row.source.quantity;
    }
    return {
      name: row.card.name,
      sourceName: row.source.name,
      quantity: row.source.quantity,
      section: row.source.section,
      unit,
      line,
      status: row.status,
      card: row.card,
    };
  });

  return {
    lines,
    total: Math.round(total * 100) / 100,
    pricedCards,
    unpricedCards,
    unmatchedCards,
  };
}
