export interface SearchSuggestion {
  id: string;
  primary: string;
  secondary?: string;
}

function rankMatch(haystack: string, query: string): number {
  const h = haystack.toLowerCase();
  const q = query.toLowerCase();
  if (!q || !h) return -1;
  if (h === q) return 0;
  if (h.startsWith(q)) return 1;
  if (h.includes(q)) return 2;
  return -1;
}

/** Ranked autocomplete lines for the binder search box. */
export function suggestCollectionQueries(
  entries: Array<{
    id: string;
    note?: string;
    binder?: string;
    page?: number | null;
    slot?: number | null;
    card: {
      name: string;
      setPrefix: string;
      setName: string;
      collectorNumber: string;
    };
  }>,
  query: string,
  limit = 8,
): SearchSuggestion[] {
  const q = query.trim();
  if (q.length < 1) return [];

  type Hit = SearchSuggestion & { rank: number };
  const hits: Hit[] = [];
  const seen = new Set<string>();

  function push(item: SearchSuggestion, rank: number) {
    if (rank < 0 || seen.has(item.id)) return;
    seen.add(item.id);
    hits.push({ ...item, rank });
  }

  for (const entry of entries) {
    const nameRank = rankMatch(entry.card.name, q);
    if (nameRank >= 0) {
      push(
        {
          id: `name:${entry.card.name.toLowerCase()}`,
          primary: entry.card.name,
          secondary: `${entry.card.setPrefix} #${entry.card.collectorNumber}`,
        },
        nameRank,
      );
    }

    const setRanks = [entry.card.setPrefix, entry.card.setName]
      .map((s) => rankMatch(s, q))
      .filter((r) => r >= 0);
    if (setRanks.length > 0) {
      push(
        {
          id: `set:${entry.card.setPrefix.toLowerCase()}`,
          primary: entry.card.setPrefix,
          secondary: entry.card.setName || "Set",
        },
        Math.min(...setRanks) + 3,
      );
    }

    const num = entry.card.collectorNumber;
    const codeRanks = [num, `${entry.card.setPrefix} ${num}`, `${entry.card.setPrefix}-${num}`]
      .map((s) => rankMatch(s, q))
      .filter((r) => r >= 0);
    if (codeRanks.length > 0) {
      push(
        {
          id: `code:${entry.card.setPrefix}:${num}`,
          primary: `${entry.card.setPrefix} ${num}`,
          secondary: entry.card.name,
        },
        Math.min(...codeRanks) + 4,
      );
    }

    if (entry.binder) {
      const binderRank = rankMatch(entry.binder, q);
      if (binderRank >= 0) {
        push(
          {
            id: `binder:${entry.binder.toLowerCase()}`,
            primary: entry.binder,
            secondary: "Binder",
          },
          binderRank + 5,
        );
      }
    }

    if (entry.note) {
      const noteRank = rankMatch(entry.note, q);
      if (noteRank >= 0) {
        push(
          {
            id: `note:${entry.id}`,
            primary: entry.note.slice(0, 48),
            secondary: entry.card.name,
          },
          noteRank + 6,
        );
      }
    }
  }

  hits.sort(
    (a, b) =>
      a.rank - b.rank || a.primary.localeCompare(b.primary),
  );
  return hits.slice(0, limit).map(({ id, primary, secondary }) => ({
    id,
    primary,
    secondary,
  }));
}

/** Dedupe card printings into autocomplete rows (name + set). */
export function suggestionsFromCards(
  cards: Array<{
    editionId: string;
    name: string;
    setPrefix: string;
    collectorNumber: string;
    setName?: string;
  }>,
  limit = 8,
): SearchSuggestion[] {
  const out: SearchSuggestion[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    const key = `${card.name.toLowerCase()}|${card.setPrefix}|${card.collectorNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: card.editionId,
      primary: card.name,
      secondary: `${card.setPrefix} #${card.collectorNumber}${
        card.setName ? ` · ${card.setName}` : ""
      }`,
    });
    if (out.length >= limit) break;
  }
  return out;
}
