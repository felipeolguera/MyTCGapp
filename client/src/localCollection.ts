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
  normalizeBinderLabel,
  normalizeBinderPage,
  normalizeBinderSlot,
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
  note?: string;
  binder?: string;
  page?: number | null;
  slot?: number | null;
}

/** Optional sell metadata applied when adding from scan confirm. */
export interface AddCollectionMeta {
  forSale?: boolean;
  condition?: CardCondition;
  askingPrice?: number | null;
  binder?: string;
  page?: number | null;
  slot?: number | null;
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
    note: typeof raw.note === "string" ? raw.note.slice(0, 280) : "",
    binder: normalizeBinderLabel(raw.binder),
    page: normalizeBinderPage(raw.page),
    slot: normalizeBinderSlot(raw.slot),
  };
}

function writeEntries(entries: CollectionEntry[]) {
  const json = JSON.stringify(entries);
  const tmpKey = `${STORAGE_KEY}.tmp`;
  // Two-phase write so a crash mid-save is less likely to wipe the binder.
  localStorage.setItem(tmpKey, json);
  localStorage.setItem(STORAGE_KEY, json);
  localStorage.removeItem(tmpKey);
}

function readEntries(): CollectionEntry[] {
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem(`${STORAGE_KEY}.tmp`);
    if (raw) {
      if (!localStorage.getItem(STORAGE_KEY) && localStorage.getItem(`${STORAGE_KEY}.tmp`)) {
        localStorage.setItem(STORAGE_KEY, raw);
        localStorage.removeItem(`${STORAGE_KEY}.tmp`);
      }
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
): Pick<
  CollectionEntry,
  "forSale" | "condition" | "askingPrice" | "note" | "binder" | "page" | "slot"
> {
  return {
    forSale: existing?.forSale ?? false,
    condition: existing?.condition ?? "NM",
    askingPrice: existing?.askingPrice ?? null,
    note: existing?.note ?? "",
    binder: existing?.binder ?? "",
    page: existing?.page ?? null,
    slot: existing?.slot ?? null,
  };
}

export function getLocalCollection(): CollectionSummary {
  return summarize(readEntries());
}

export function addLocalCollection(
  card: GaCardEdition,
  quantity: number,
  finish: CardFinish = "normal",
  meta?: AddCollectionMeta,
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
  const base = defaultsFrom(existing);
  const entry: CollectionEntry = {
    id,
    editionId: card.editionId,
    finish,
    quantity: previousQuantity + quantity,
    card,
    updatedAt: new Date().toISOString(),
    forSale: meta?.forSale ?? base.forSale,
    condition: normalizeCondition(meta?.condition ?? base.condition),
    askingPrice:
      meta?.askingPrice !== undefined
        ? normalizeAskingPrice(meta.askingPrice)
        : base.askingPrice,
    note: base.note,
    binder:
      meta?.binder !== undefined
        ? normalizeBinderLabel(meta.binder)
        : base.binder,
    page:
      meta?.page !== undefined ? normalizeBinderPage(meta.page) : base.page,
    slot:
      meta?.slot !== undefined ? normalizeBinderSlot(meta.slot) : base.slot,
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
    note:
      patch.note !== undefined
        ? patch.note.slice(0, 280)
        : (existing?.note ?? targetExisting?.note ?? ""),
    binder:
      patch.binder !== undefined
        ? normalizeBinderLabel(patch.binder)
        : normalizeBinderLabel(
            existing?.binder ?? targetExisting?.binder ?? "",
          ),
    page:
      patch.page !== undefined
        ? normalizeBinderPage(patch.page)
        : normalizeBinderPage(existing?.page ?? targetExisting?.page),
    slot:
      patch.slot !== undefined
        ? normalizeBinderSlot(patch.slot)
        : normalizeBinderSlot(existing?.slot ?? targetExisting?.slot),
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

/** Delete many lines at once. */
export function bulkRemoveLocal(ids: string[]): CollectionSummary {
  const idSet = new Set(ids);
  const next = readEntries().filter((entry) => !idSet.has(entry.id));
  writeEntries(next);
  return summarize(next);
}

export function findLocalEntry(id: string): CollectionEntry | undefined {
  return readEntries().find((e) => e.id === id);
}

export interface DecklistImportItem {
  card: GaCardEdition;
  quantity: number;
  /** Section label stored in note (e.g. Main Deck). */
  section?: string;
}

/**
 * Import a resolved decklist into a binder.
 * Sets absolute quantity per edition+finish and assigns the binder label.
 * Same printing from multiple sections is summed into one line.
 */
export function importDecklistLocal(
  items: DecklistImportItem[],
  binder: string,
  finish: CardFinish = "normal",
): {
  collection: CollectionSummary;
  imported: number;
  overwritten: number;
} {
  const binderLabel = normalizeBinderLabel(binder);
  if (!binderLabel) {
    throw new Error("Binder name is required");
  }
  if (items.length === 0) {
    throw new Error("No matched cards to import");
  }

  const merged = new Map<
    string,
    { card: GaCardEdition; quantity: number; sections: string[] }
  >();
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1) continue;
    const id = collectionEntryId(item.card.editionId, finish);
    const prev = merged.get(id);
    const section = (item.section ?? "").trim();
    if (prev) {
      prev.quantity = Math.min(999, prev.quantity + item.quantity);
      if (section && !prev.sections.includes(section)) {
        prev.sections.push(section);
      }
    } else {
      merged.set(id, {
        card: item.card,
        quantity: Math.min(999, item.quantity),
        sections: section ? [section] : [],
      });
    }
  }

  if (merged.size === 0) {
    throw new Error("No matched cards to import");
  }

  const entries = readEntries();
  const byId = new Map(entries.map((e) => [e.id, e]));
  let overwritten = 0;
  const now = new Date().toISOString();

  for (const [id, row] of merged) {
    const existing = byId.get(id);
    if (existing) overwritten += 1;
    const note = row.sections.length
      ? row.sections.join(" · ").slice(0, 280)
      : (existing?.note ?? "");
    byId.set(id, {
      id,
      editionId: row.card.editionId,
      finish,
      quantity: row.quantity,
      card: row.card,
      updatedAt: now,
      forSale: existing?.forSale ?? false,
      condition: existing?.condition ?? "NM",
      askingPrice: existing?.askingPrice ?? null,
      note,
      binder: binderLabel,
      page: null,
      slot: null,
    });
  }

  const next = [...byId.values()];
  writeEntries(next);
  return {
    collection: summarize(next),
    imported: merged.size,
    overwritten,
  };
}
