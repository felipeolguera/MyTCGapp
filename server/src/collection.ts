import type { CollectionEntry, CollectionSummary, GaCardEdition } from "./types.js";

export function createCollectionStore() {
  const entries = new Map<string, CollectionEntry>();

  function summary(): CollectionSummary {
    const list = [...entries.values()].sort((a, b) =>
      a.card.name.localeCompare(b.card.name),
    );
    return {
      entries: list,
      uniqueCards: list.length,
      totalCards: list.reduce((sum, e) => sum + e.quantity, 0),
    };
  }

  function upsert(card: GaCardEdition, quantity: number): CollectionEntry {
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new Error("Quantity must be a non-negative integer");
    }

    if (quantity === 0) {
      entries.delete(card.editionId);
      return {
        editionId: card.editionId,
        quantity: 0,
        card,
        updatedAt: new Date().toISOString(),
      };
    }

    const existing = entries.get(card.editionId);
    const entry: CollectionEntry = {
      editionId: card.editionId,
      quantity,
      card: existing?.card ?? card,
      updatedAt: new Date().toISOString(),
    };
    // Prefer freshest card payload when provided.
    entry.card = card;
    entries.set(card.editionId, entry);
    return entry;
  }

  function add(card: GaCardEdition, quantity: number): CollectionEntry {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error("Quantity must be a positive integer");
    }
    const existing = entries.get(card.editionId);
    const nextQty = (existing?.quantity ?? 0) + quantity;
    return upsert(card, nextQty);
  }

  function remove(editionId: string): boolean {
    return entries.delete(editionId);
  }

  function get(editionId: string): CollectionEntry | undefined {
    return entries.get(editionId);
  }

  return { summary, upsert, add, remove, get };
}

export type CollectionStore = ReturnType<typeof createCollectionStore>;
