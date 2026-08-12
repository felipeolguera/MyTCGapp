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
    return a.finish.localeCompare(b.finish);
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
): { entry: CollectionEntry; collection: CollectionSummary } {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
    throw new Error("quantity must be an integer from 1 to 999");
  }

  const id = collectionEntryId(card.editionId, finish);
  const entries = readEntries();
  const existing = entries.find((e) => e.id === id);
  const entry: CollectionEntry = {
    id,
    editionId: card.editionId,
    finish,
    quantity: (existing?.quantity ?? 0) + quantity,
    card,
    updatedAt: new Date().toISOString(),
  };

  const next = existing
    ? entries.map((e) => (e.id === id ? entry : e))
    : [...entries, entry];

  writeEntries(next);
  return { entry, collection: summarize(next) };
}
