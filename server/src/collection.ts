import type {
  CardFinish,
  CollectionEntry,
  CollectionSummary,
  GaCardEdition,
} from "./types.js";
import { collectionEntryId } from "./types.js";

export function createCollectionStore() {
  const entries = new Map<string, CollectionEntry>();

  function summary(): CollectionSummary {
    const list = [...entries.values()].sort((a, b) => {
      const name = a.card.name.localeCompare(b.card.name);
      if (name) return name;
      return a.finish.localeCompare(b.finish);
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
  ): CollectionEntry {
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new Error("Quantity must be a non-negative integer");
    }

    const id = collectionEntryId(card.editionId, finish);
    if (quantity === 0) {
      entries.delete(id);
      return {
        id,
        editionId: card.editionId,
        finish,
        quantity: 0,
        card,
        updatedAt: new Date().toISOString(),
      };
    }

    const entry: CollectionEntry = {
      id,
      editionId: card.editionId,
      finish,
      quantity,
      card,
      updatedAt: new Date().toISOString(),
    };
    entries.set(id, entry);
    return entry;
  }

  function add(
    card: GaCardEdition,
    quantity: number,
    finish: CardFinish = "normal",
  ): { entry: CollectionEntry; previousQuantity: number } {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error("Quantity must be a positive integer");
    }
    const id = collectionEntryId(card.editionId, finish);
    const existing = entries.get(id);
    const previousQuantity = existing?.quantity ?? 0;
    const nextQty = previousQuantity + quantity;
    return { entry: upsert(card, nextQty, finish), previousQuantity };
  }

  /**
   * Update an existing line. Changing finish moves the stack to the new
   * finish id (replacing any quantity already on that finish).
   */
  function update(
    id: string,
    card: GaCardEdition,
    quantity: number,
    finish: CardFinish,
  ): CollectionEntry {
    const existing = entries.get(id);
    if (!existing && quantity > 0) {
      // Allow create-via-update when card payload is present.
      return upsert(card, quantity, finish);
    }
    if (existing && (existing.finish !== finish || existing.id !== collectionEntryId(card.editionId, finish))) {
      entries.delete(id);
    }
    return upsert(card, quantity, finish);
  }

  function remove(id: string): boolean {
    return entries.delete(id);
  }

  function get(id: string): CollectionEntry | undefined {
    return entries.get(id);
  }

  return { summary, upsert, add, update, remove, get };
}

export type CollectionStore = ReturnType<typeof createCollectionStore>;
