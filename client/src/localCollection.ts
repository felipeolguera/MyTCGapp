import type {
  CardFinish,
  CollectionEntry,
  CollectionSummary,
  GaCardEdition,
} from "./types";
import { collectionEntryId } from "./types";

const STORAGE_KEY = "archive-binder.collection.v2";
const LEGACY_KEY = "archive-binder.collection.v1";

function normalizeEntry(raw: Partial<CollectionEntry> & {
  editionId?: string;
  card?: GaCardEdition;
  quantity?: number;
}): CollectionEntry | null {
  if (!raw.card?.editionId && !raw.editionId) return null;
  const editionId = raw.editionId ?? raw.card!.editionId;
  const finish: CardFinish = raw.finish === "foil" ? "foil" : "normal";
  const quantity = Number(raw.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) return null;
  return {
    id: raw.id ?? collectionEntryId(editionId, finish),
    editionId,
    finish,
    quantity,
    card: raw.card!,
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
  };
}

function readEntries(): CollectionEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown[];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((row) => normalizeEntry(row as CollectionEntry))
        .filter((e): e is CollectionEntry => e !== null);
    }

    // Migrate v1 (no finish) → normal.
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (!legacy) return [];
    const parsed = JSON.parse(legacy) as Array<{
      editionId: string;
      quantity: number;
      card: GaCardEdition;
      updatedAt?: string;
    }>;
    const migrated = (Array.isArray(parsed) ? parsed : [])
      .map((row) =>
        normalizeEntry({
          ...row,
          finish: "normal",
          id: collectionEntryId(row.editionId, "normal"),
        }),
      )
      .filter((e): e is CollectionEntry => e !== null);
    writeEntries(migrated);
    localStorage.removeItem(LEGACY_KEY);
    return migrated;
  } catch {
    return [];
  }
}

function writeEntries(entries: CollectionEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function summarize(entries: CollectionEntry[]): CollectionSummary {
  const sorted = [...entries].sort((a, b) => {
    const name = a.card.name.localeCompare(b.card.name);
    if (name) return name;
    // Normal before Foil
    if (a.finish === b.finish) return 0;
    return a.finish === "normal" ? -1 : 1;
  });
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
  finish: CardFinish = "normal",
): {
  entry: CollectionEntry;
  collection: CollectionSummary;
  previousQuantity: number;
} {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
    throw new Error("quantity must be an integer from 1 to 999");
  }

  const id = collectionEntryId(card.editionId, finish);
  const entries = readEntries();
  const existing = entries.find((e) => e.id === id);
  const previousQuantity = existing?.quantity ?? 0;
  const entry: CollectionEntry = {
    id,
    editionId: card.editionId,
    finish,
    quantity: previousQuantity + quantity,
    card,
    updatedAt: new Date().toISOString(),
  };

  const next = existing
    ? entries.map((e) => (e.id === id ? entry : e))
    : [...entries, entry];

  writeEntries(next);
  return { entry, collection: summarize(next), previousQuantity };
}

/**
 * Set absolute quantity for an entry. Quantity 0 removes it.
 * Changing finish moves/replaces the line (merges into existing finish if any).
 */
export function updateLocalCollection(
  id: string,
  quantity: number,
  finish: CardFinish,
  card?: GaCardEdition,
): { entry: CollectionEntry; collection: CollectionSummary } {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 999) {
    throw new Error("quantity must be an integer from 0 to 999");
  }

  const entries = readEntries();
  const existing = entries.find((e) => e.id === id);
  const cardPayload = card ?? existing?.card;
  if (!cardPayload) {
    throw new Error("card not found in collection");
  }

  const targetId = collectionEntryId(cardPayload.editionId, finish);
  let next = entries.filter((e) => e.id !== id && e.id !== targetId);

  if (quantity === 0) {
    writeEntries(next);
    return {
      entry: {
        id: targetId,
        editionId: cardPayload.editionId,
        finish,
        quantity: 0,
        card: cardPayload,
        updatedAt: new Date().toISOString(),
      },
      collection: summarize(next),
    };
  }

  // If moving finish onto an existing line, replace with the edited quantity
  // (absolute set — editor shows the stack being saved).
  const entry: CollectionEntry = {
    id: targetId,
    editionId: cardPayload.editionId,
    finish,
    quantity,
    card: cardPayload,
    updatedAt: new Date().toISOString(),
  };
  next = [...next, entry];
  writeEntries(next);
  return { entry, collection: summarize(next) };
}

export function removeLocalCollection(
  id: string,
): { collection: CollectionSummary; removed: boolean } {
  const entries = readEntries();
  const next = entries.filter((e) => e.id !== id);
  const removed = next.length !== entries.length;
  if (removed) writeEntries(next);
  return { collection: summarize(next), removed };
}
