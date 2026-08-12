import type {
  CardCondition,
  CardFinish,
  CollectionEntry,
  CollectionSummary,
  GaCardEdition,
} from "./types";
import {
  collectionEntryId,
  normalizeAskingPrice,
  normalizeCondition,
} from "./types";

const STORAGE_KEY = "archive-binder.collection.v3";
const LEGACY_V2_KEY = "archive-binder.collection.v2";
const LEGACY_V1_KEY = "archive-binder.collection.v1";

export interface CollectionEntryPatch {
  quantity: number;
  finish: CardFinish;
  card?: GaCardEdition;
  forSale?: boolean;
  condition?: CardCondition;
  askingPrice?: number | null;
}

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
    forSale: Boolean(raw.forSale),
    condition: normalizeCondition(raw.condition),
    askingPrice: normalizeAskingPrice(raw.askingPrice),
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

    const v2 = localStorage.getItem(LEGACY_V2_KEY);
    if (v2) {
      const parsed = JSON.parse(v2) as unknown[];
      const migrated = (Array.isArray(parsed) ? parsed : [])
        .map((row) => normalizeEntry(row as CollectionEntry))
        .filter((e): e is CollectionEntry => e !== null);
      writeEntries(migrated);
      localStorage.removeItem(LEGACY_V2_KEY);
      return migrated;
    }

    const legacy = localStorage.getItem(LEGACY_V1_KEY);
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
    localStorage.removeItem(LEGACY_V1_KEY);
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
    if (a.finish === b.finish) return 0;
    return a.finish === "normal" ? -1 : 1;
  });
  return {
    entries: sorted,
    uniqueCards: sorted.length,
    totalCards: sorted.reduce((sum, e) => sum + e.quantity, 0),
  };
}

function defaultsFrom(
  existing?: CollectionEntry,
): Pick<CollectionEntry, "forSale" | "condition" | "askingPrice"> {
  return {
    forSale: existing?.forSale ?? false,
    condition: existing?.condition ?? "NM",
    askingPrice: existing?.askingPrice ?? null,
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
    ...defaultsFrom(existing),
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
  patch: CollectionEntryPatch,
): { entry: CollectionEntry; collection: CollectionSummary } {
  const { quantity, finish } = patch;
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 999) {
    throw new Error("quantity must be an integer from 0 to 999");
  }

  const entries = readEntries();
  const existing = entries.find((e) => e.id === id);
  const cardPayload = patch.card ?? existing?.card;
  if (!cardPayload) {
    throw new Error("card not found in collection");
  }

  const targetId = collectionEntryId(cardPayload.editionId, finish);
  const targetExisting = entries.find((e) => e.id === targetId);
  let next = entries.filter((e) => e.id !== id && e.id !== targetId);

  const sell = {
    forSale:
      patch.forSale ?? existing?.forSale ?? targetExisting?.forSale ?? false,
    condition: normalizeCondition(
      patch.condition ?? existing?.condition ?? targetExisting?.condition,
    ),
    askingPrice:
      patch.askingPrice !== undefined
        ? normalizeAskingPrice(patch.askingPrice)
        : normalizeAskingPrice(
            existing?.askingPrice ?? targetExisting?.askingPrice,
          ),
  };

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
        ...sell,
      },
      collection: summarize(next),
    };
  }

  const entry: CollectionEntry = {
    id: targetId,
    editionId: cardPayload.editionId,
    finish,
    quantity,
    card: cardPayload,
    updatedAt: new Date().toISOString(),
    ...sell,
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

/** Replace the entire binder (used by restore). */
export function replaceLocalCollection(
  entries: CollectionEntry[],
): CollectionSummary {
  const normalized = entries
    .map((row) => normalizeEntry(row))
    .filter((e): e is CollectionEntry => e !== null);
  writeEntries(normalized);
  return summarize(normalized);
}

/** Bulk toggle for-sale on many lines (one write). */
export function bulkSetForSaleLocal(
  ids: string[],
  forSale: boolean,
): CollectionSummary {
  const idSet = new Set(ids);
  const now = new Date().toISOString();
  const next = readEntries().map((entry) =>
    idSet.has(entry.id) ? { ...entry, forSale, updatedAt: now } : entry,
  );
  writeEntries(next);
  return summarize(next);
}
