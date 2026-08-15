import { describe, expect, it, beforeEach } from "vitest";
import {
  addLocalCollection,
  bulkRemoveLocal,
  getLocalCollection,
  importDecklistLocal,
  removeLocalCollection,
  updateLocalCollection,
} from "./localCollection";
import type { GaCardEdition } from "./types";

const memory = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
  removeItem: (key: string) => {
    memory.delete(key);
  },
  clear: () => memory.clear(),
};

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  configurable: true,
});

const card: GaCardEdition = {
  editionId: "ed-1",
  cardId: "c-1",
  name: "Spirit of Slime",
  slug: "spirit-of-slime",
  types: ["CHAMPION"],
  classes: [],
  element: "NORM",
  elements: ["NORM"],
  costMemory: 0,
  costReserve: null,
  level: 0,
  life: 15,
  power: null,
  effect: null,
  rarity: 1,
  collectorNumber: "001",
  imagePath: "/x.jpg",
  imageUrl: "https://example.com/x.jpg",
  setName: "Re:Collection Slime",
  setPrefix: "ReC-SLM",
  illustrator: null,
};

describe("localCollection edit/undo helpers", () => {
  beforeEach(() => {
    memory.clear();
  });

  it("tracks previousQuantity for undo", () => {
    const first = addLocalCollection(card, 2, "normal");
    expect(first.previousQuantity).toBe(0);
    const second = addLocalCollection(card, 3, "normal");
    expect(second.previousQuantity).toBe(2);
    expect(second.entry.quantity).toBe(5);
  });

  it("updates quantity and can change finish", () => {
    const added = addLocalCollection(card, 4, "normal");
    const moved = updateLocalCollection(added.entry.id, {
      quantity: 4,
      finish: "foil",
      card,
    });
    expect(moved.entry.finish).toBe("foil");
    expect(moved.collection.uniqueCards).toBe(1);
    expect(moved.collection.entries[0].id).toBe("ed-1:foil");
  });

  it("removes an entry", () => {
    const added = addLocalCollection(card, 1, "foil");
    const removed = removeLocalCollection(added.entry.id);
    expect(removed.removed).toBe(true);
    expect(getLocalCollection().totalCards).toBe(0);
  });

  it("undoes an add by restoring previousQuantity", () => {
    addLocalCollection(card, 2, "normal");
    const second = addLocalCollection(card, 5, "normal");
    updateLocalCollection(second.entry.id, {
      quantity: second.previousQuantity,
      finish: "normal",
      card,
    });
    expect(getLocalCollection().totalCards).toBe(2);
  });

  it("stores for-sale metadata", () => {
    const added = addLocalCollection(card, 1, "normal");
    const updated = updateLocalCollection(added.entry.id, {
      quantity: 1,
      finish: "normal",
      card,
      forSale: true,
      condition: "LP",
      askingPrice: 12.5,
    });
    expect(updated.entry.forSale).toBe(true);
    expect(updated.entry.condition).toBe("LP");
    expect(updated.entry.askingPrice).toBe(12.5);
  });

  it("stores a note and bulk-removes lines", () => {
    const a = addLocalCollection(card, 1, "normal");
    const b = addLocalCollection(card, 2, "foil");
    updateLocalCollection(a.entry.id, {
      quantity: 1,
      finish: "normal",
      card,
      note: "Trade bait",
    });
    expect(getLocalCollection().entries.find((e) => e.id === a.entry.id)?.note).toBe(
      "Trade bait",
    );
    const next = bulkRemoveLocal([a.entry.id, b.entry.id]);
    expect(next.totalCards).toBe(0);
  });

  it("applies sell meta on add", () => {
    const added = addLocalCollection(card, 2, "foil", {
      forSale: true,
      condition: "LP",
      askingPrice: 9.5,
    });
    expect(added.entry.forSale).toBe(true);
    expect(added.entry.condition).toBe("LP");
    expect(added.entry.askingPrice).toBe(9.5);
  });

  it("stores binder geography on add and update", () => {
    const added = addLocalCollection(card, 1, "normal", {
      binder: "Trade",
      page: 12,
      slot: 4,
    });
    expect(added.entry.binder).toBe("Trade");
    expect(added.entry.page).toBe(12);
    expect(added.entry.slot).toBe(4);
    const updated = updateLocalCollection(added.entry.id, {
      quantity: 1,
      finish: "normal",
      card,
      binder: "Main",
      page: 3,
      slot: null,
    });
    expect(updated.entry.binder).toBe("Main");
    expect(updated.entry.page).toBe(3);
    expect(updated.entry.slot).toBeNull();
  });

  it("imports a decklist into a binder with absolute quantities", () => {
    addLocalCollection(card, 2, "normal", { binder: "Trade" });
    const result = importDecklistLocal(
      [{ card, quantity: 4, section: "Main Deck" }],
      "Obla",
      "normal",
    );
    expect(result.imported).toBe(1);
    expect(result.overwritten).toBe(1);
    const entry = result.collection.entries[0];
    expect(entry.binder).toBe("Obla");
    expect(entry.quantity).toBe(4);
    expect(entry.note).toBe("Main Deck");
  });
});
