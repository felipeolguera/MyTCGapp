import type {
  CardFinish,
  CollectionEntry,
  CollectionSummary,
  GaCardEdition,
} from "./types";
import { searchGaCardsDirect } from "./gatcgClient";
import {
  addLocalCollection,
  bulkRemoveLocal,
  bulkSetForSaleLocal,
  getLocalCollection,
  importDecklistLocal,
  removeLocalCollection,
  replaceLocalCollection,
  updateLocalCollection,
  type AddCollectionMeta,
  type CollectionEntryPatch,
  type DecklistImportItem,
} from "./localCollection";
import { searchCardIndex } from "./visualMatch";
import {
  cardAllowedInSection,
  type DeckSectionId,
} from "./deckSections";

/** Native/APK builds talk to GATCG + localStorage; web/dev can use the Express API. */
export function isStandaloneMode(): boolean {
  return import.meta.env.VITE_STANDALONE === "true";
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function searchCards(name: string): Promise<GaCardEdition[]> {
  // Local index first — works offline on the APK even when GATCG is unreachable.
  try {
    const local = await searchCardIndex(name, 20);
    if (local.length > 0) return local;
  } catch {
    // Index missing or still loading — fall through to network.
  }

  if (isStandaloneMode()) {
    return searchGaCardsDirect(name, 20);
  }
  const data = await json<{ cards: GaCardEdition[] }>(
    await fetch(`/api/ga/search?name=${encodeURIComponent(name)}`),
  );
  return data.cards;
}

/** Section-aware search for the deck builder (Material = champions/regalia). */
export async function searchCardsForDeckSection(
  name: string,
  section: DeckSectionId,
  limit = 12,
): Promise<GaCardEdition[]> {
  try {
    const local = await searchCardIndex(name, limit * 3, {
      filter: (card) => cardAllowedInSection(card, section),
    });
    if (local.length > 0) return local.slice(0, limit);
  } catch {
    // fall through
  }

  const broad = await searchCards(name);
  return broad
    .filter((card) => cardAllowedInSection(card, section))
    .slice(0, limit);
}

export async function fetchCollection(): Promise<CollectionSummary> {
  if (isStandaloneMode()) {
    return getLocalCollection();
  }
  const data = await json<{ collection: CollectionSummary }>(
    await fetch("/api/collection"),
  );
  return data.collection;
}

export async function addToCollection(
  card: GaCardEdition,
  quantity: number,
  finish: CardFinish = "normal",
  meta?: AddCollectionMeta,
): Promise<{
  entry: CollectionEntry;
  collection: CollectionSummary;
  previousQuantity: number;
}> {
  if (isStandaloneMode()) {
    return addLocalCollection(card, quantity, finish, meta);
  }
  const data = await json<{
    entry: CollectionEntry;
    collection: CollectionSummary;
    previousQuantity?: number;
  }>(
    await fetch("/api/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card, quantity, finish, ...meta }),
    }),
  );
  return {
    ...data,
    previousQuantity: data.previousQuantity ?? data.entry.quantity - quantity,
  };
}

export async function updateCollectionEntry(
  id: string,
  patch: CollectionEntryPatch & { card: GaCardEdition },
): Promise<{ entry: CollectionEntry; collection: CollectionSummary }> {
  if (isStandaloneMode()) {
    return updateLocalCollection(id, patch);
  }
  return json(
    await fetch(`/api/collection/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
  );
}

export async function removeFromCollection(
  id: string,
): Promise<{ collection: CollectionSummary }> {
  if (isStandaloneMode()) {
    const result = removeLocalCollection(id);
    if (!result.removed) {
      throw new Error("Card not in collection");
    }
    return { collection: result.collection };
  }
  return json(
    await fetch(`/api/collection/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  );
}

export async function restoreCollection(
  entries: CollectionEntry[],
): Promise<CollectionSummary> {
  if (isStandaloneMode()) {
    return replaceLocalCollection(entries);
  }
  const data = await json<{ collection: CollectionSummary }>(
    await fetch("/api/collection", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    }),
  );
  return data.collection;
}

export async function bulkSetForSale(
  ids: string[],
  forSale: boolean,
): Promise<CollectionSummary> {
  if (isStandaloneMode()) {
    return bulkSetForSaleLocal(ids, forSale);
  }
  const data = await json<{ collection: CollectionSummary }>(
    await fetch("/api/collection/bulk-sale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, forSale }),
    }),
  );
  return data.collection;
}

export async function bulkRemoveFromCollection(
  ids: string[],
): Promise<CollectionSummary> {
  if (isStandaloneMode()) {
    return bulkRemoveLocal(ids);
  }
  const data = await json<{ collection: CollectionSummary }>(
    await fetch("/api/collection/bulk-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }),
  );
  return data.collection;
}

/** Import a resolved decklist into a named binder (absolute qty per card). */
export async function importDecklistToBinder(
  items: DecklistImportItem[],
  binder: string,
  finish: CardFinish = "normal",
): Promise<{
  collection: CollectionSummary;
  imported: number;
  overwritten: number;
}> {
  if (isStandaloneMode()) {
    return importDecklistLocal(items, binder, finish);
  }

  const binderLabel = binder.trim().slice(0, 40);
  if (!binderLabel) throw new Error("Binder name is required");

  const current = await fetchCollection();
  const memory = new Map(current.entries.map((e) => [e.id, e] as const));
  const mergedItems = new Map<
    string,
    { card: GaCardEdition; quantity: number; sections: string[] }
  >();
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) continue;
    const id = `${item.card.editionId}:${finish}`;
    const prev = mergedItems.get(id);
    const section = (item.section ?? "").trim();
    if (prev) {
      prev.quantity = Math.min(999, prev.quantity + item.quantity);
      if (section && !prev.sections.includes(section)) prev.sections.push(section);
    } else {
      mergedItems.set(id, {
        card: item.card,
        quantity: Math.min(999, item.quantity),
        sections: section ? [section] : [],
      });
    }
  }
  if (mergedItems.size === 0) throw new Error("No matched cards to import");

  let overwrittenCount = 0;
  const now = new Date().toISOString();
  for (const [id, row] of mergedItems) {
    const existing = memory.get(id);
    if (existing) overwrittenCount += 1;
    memory.set(id, {
      id,
      editionId: row.card.editionId,
      finish,
      quantity: row.quantity,
      card: row.card,
      updatedAt: now,
      forSale: existing?.forSale ?? false,
      condition: existing?.condition ?? "NM",
      askingPrice: existing?.askingPrice ?? null,
      note: row.sections.length
        ? row.sections.join(" · ").slice(0, 280)
        : (existing?.note ?? ""),
      binder: binderLabel,
      page: null,
      slot: null,
    });
  }
  const next = await restoreCollection([...memory.values()]);
  return {
    collection: next,
    imported: mergedItems.size,
    overwritten: overwrittenCount,
  };
}
