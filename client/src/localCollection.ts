import type { CollectionEntry, CollectionSummary, GaCardEdition } from "./types";

const STORAGE_KEY = "archive-binder.collection.v1";

function readEntries(): CollectionEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CollectionEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: CollectionEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function summarize(entries: CollectionEntry[]): CollectionSummary {
  const sorted = [...entries].sort((a, b) =>
    a.card.name.localeCompare(b.card.name),
  );
  return {
    entries: sorted,
    uniqueCards: sorted.length,
    totalCards: sorted.reduce((sum, e) => sum + e.quantity, 0),
  };
}

export function getLocalCollection(): CollectionSummary {
  return summarize(readEntries());
}

export function addLocalCollection(
  card: GaCardEdition,
  quantity: number,
): { entry: CollectionEntry; collection: CollectionSummary } {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
    throw new Error("quantity must be an integer from 1 to 999");
  }

  const entries = readEntries();
  const existing = entries.find((e) => e.editionId === card.editionId);
  const entry: CollectionEntry = {
    editionId: card.editionId,
    quantity: (existing?.quantity ?? 0) + quantity,
    card,
    updatedAt: new Date().toISOString(),
  };

  const next = existing
    ? entries.map((e) => (e.editionId === card.editionId ? entry : e))
    : [...entries, entry];

  writeEntries(next);
  return { entry, collection: summarize(next) };
}
