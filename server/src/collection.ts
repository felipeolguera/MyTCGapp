import type {
  CardCondition,
  CardFinish,
  CollectionEntry,
  CollectionSummary,
  GaCardEdition,
} from "./types.js";
import {
  collectionEntryId,
  normalizeAskingPrice,
  normalizeCondition,
} from "./types.js";

export interface CollectionEntryPatch {
  quantity: number;
  finish: CardFinish;
  card?: GaCardEdition;
  forSale?: boolean;
  condition?: CardCondition;
  askingPrice?: number | null;
  note?: string;
}

function normalizeNote(raw: unknown): string {
  return typeof raw === "string" ? raw.slice(0, 280) : "";
}

export function createCollectionStore() {
  const entries = new Map<string, CollectionEntry>();

  function summary(): CollectionSummary {
    const list = [...entries.values()].sort((a, b) => {
      const name = a.card.name.localeCompare(b.card.name);
      if (name) return name;
      if (a.finish === b.finish) return 0;
      return a.finish === "normal" ? -1 : 1;
    });
    return {
      entries: list,
      uniqueCards: list.length,
      totalCards: list.reduce((sum, e) => sum + e.quantity, 0),
    };
  }

  function upsert(
    card: GaCardEdition,
    quantity: number,
    finish: CardFinish = "normal",
    meta?: Partial<
      Pick<CollectionEntry, "forSale" | "condition" | "askingPrice" | "note">
    >,
  ): CollectionEntry {
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new Error("Quantity must be a non-negative integer");
    }

    const id = collectionEntryId(card.editionId, finish);
    const existing = entries.get(id);
    if (quantity === 0) {
      entries.delete(id);
      return {
        id,
        editionId: card.editionId,
        finish,
        quantity: 0,
        card,
        updatedAt: new Date().toISOString(),
        forSale: meta?.forSale ?? existing?.forSale ?? false,
        condition: normalizeCondition(meta?.condition ?? existing?.condition),
        askingPrice: normalizeAskingPrice(
          meta?.askingPrice !== undefined
            ? meta.askingPrice
            : existing?.askingPrice,
        ),
        note: normalizeNote(
          meta?.note !== undefined ? meta.note : existing?.note,
        ),
      };
    }

    const entry: CollectionEntry = {
      id,
      editionId: card.editionId,
      finish,
      quantity,
      card,
      updatedAt: new Date().toISOString(),
      forSale: meta?.forSale ?? existing?.forSale ?? false,
      condition: normalizeCondition(meta?.condition ?? existing?.condition),
      askingPrice: normalizeAskingPrice(
        meta?.askingPrice !== undefined
          ? meta.askingPrice
          : existing?.askingPrice,
      ),
      note: normalizeNote(
        meta?.note !== undefined ? meta.note : existing?.note,
      ),
    };
    entries.set(id, entry);
    return entry;
  }

  function add(
    card: GaCardEdition,
    quantity: number,
    finish: CardFinish = "normal",
    meta?: Partial<
      Pick<CollectionEntry, "forSale" | "condition" | "askingPrice" | "note">
    >,
  ): { entry: CollectionEntry; previousQuantity: number } {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error("Quantity must be a positive integer");
    }
    const id = collectionEntryId(card.editionId, finish);
    const existing = entries.get(id);
    const previousQuantity = existing?.quantity ?? 0;
    const nextQty = previousQuantity + quantity;
    return {
      entry: upsert(card, nextQty, finish, {
        forSale: meta?.forSale ?? existing?.forSale,
        condition: meta?.condition ?? existing?.condition,
        askingPrice:
          meta?.askingPrice !== undefined
            ? meta.askingPrice
            : existing?.askingPrice,
        note: meta?.note !== undefined ? meta.note : existing?.note,
      }),
      previousQuantity,
    };
  }

  function update(id: string, patch: CollectionEntryPatch): CollectionEntry {
    const existing = entries.get(id);
    const card = patch.card ?? existing?.card;
    if (!card) {
      throw new Error("card payload required when entry does not exist");
    }
    if (
      existing &&
      (existing.finish !== patch.finish ||
        existing.id !== collectionEntryId(card.editionId, patch.finish))
    ) {
      entries.delete(id);
    }
    return upsert(card, patch.quantity, patch.finish, {
      forSale: patch.forSale ?? existing?.forSale,
      condition: patch.condition ?? existing?.condition,
      askingPrice:
        patch.askingPrice !== undefined
          ? patch.askingPrice
          : existing?.askingPrice,
      note: patch.note !== undefined ? patch.note : existing?.note,
    });
  }

  function remove(id: string): boolean {
    return entries.delete(id);
  }

  function get(id: string): CollectionEntry | undefined {
    return entries.get(id);
  }

  function replaceAll(next: CollectionEntry[]): CollectionSummary {
    entries.clear();
    for (const row of next) {
      entries.set(row.id, {
        ...row,
        forSale: Boolean(row.forSale),
        condition: normalizeCondition(row.condition),
        askingPrice: normalizeAskingPrice(row.askingPrice),
        note: normalizeNote(row.note),
      });
    }
    return summary();
  }

  function bulkSetForSale(ids: string[], forSale: boolean): CollectionSummary {
    const idSet = new Set(ids);
    const now = new Date().toISOString();
    for (const [id, entry] of entries) {
      if (!idSet.has(id)) continue;
      entries.set(id, { ...entry, forSale, updatedAt: now });
    }
    return summary();
  }

  function bulkRemove(ids: string[]): CollectionSummary {
    for (const id of ids) entries.delete(id);
    return summary();
  }

  return {
    summary,
    upsert,
    add,
    update,
    remove,
    get,
    replaceAll,
    bulkSetForSale,
    bulkRemove,
  };
}

export type CollectionStore = ReturnType<typeof createCollectionStore>;
