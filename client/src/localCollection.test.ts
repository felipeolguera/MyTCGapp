import { describe, expect, it, beforeEach } from "vitest";
import {
  addLocalCollection,
  getLocalCollection,
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
    const moved = updateLocalCollection(added.entry.id, 4, "foil", card);
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
    updateLocalCollection(
      second.entry.id,
      second.previousQuantity,
      "normal",
      card,
    );
    expect(getLocalCollection().totalCards).toBe(2);
  });
});
