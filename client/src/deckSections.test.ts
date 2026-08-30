import { describe, expect, it } from "vitest";
import {
  cardAllowedInSection,
  isMainDeckCard,
  isMaterialCard,
} from "./deckSections";
import type { GaCardEdition } from "./types";

function card(types: string[], name = "Test"): GaCardEdition {
  return {
    editionId: "e1",
    cardId: "c1",
    name,
    slug: "test",
    types,
    classes: [],
    element: null,
    elements: [],
    costMemory: null,
    costReserve: null,
    level: null,
    life: null,
    power: null,
    effect: null,
    rarity: 1,
    collectorNumber: "001",
    imagePath: "",
    imageUrl: "",
    setName: "Test",
    setPrefix: "TST",
    illustrator: null,
  };
}

describe("deckSections", () => {
  it("treats champions and regalia as material-only", () => {
    expect(isMaterialCard(card(["CHAMPION"]))).toBe(true);
    expect(isMaterialCard(card(["REGALIA", "ITEM"]))).toBe(true);
    expect(isMaterialCard(card(["REGALIA", "WEAPON"]))).toBe(true);
    expect(isMaterialCard(card(["ALLY", "REGALIA"]))).toBe(true);
    expect(isMaterialCard(card(["ACTION"]))).toBe(false);
    expect(isMaterialCard(card(["ALLY"]))).toBe(false);
  });

  it("allows material cards only in the Material section search", () => {
    const regalia = card(["ITEM", "REGALIA"], "Quicksilver Grail");
    const action = card(["ACTION"], "Fracturize");
    expect(cardAllowedInSection(regalia, "material")).toBe(true);
    expect(cardAllowedInSection(action, "material")).toBe(false);
    expect(cardAllowedInSection(regalia, "main")).toBe(false);
    expect(cardAllowedInSection(action, "main")).toBe(true);
    expect(cardAllowedInSection(action, "sideboard")).toBe(true);
    expect(isMainDeckCard(action)).toBe(true);
  });
});
