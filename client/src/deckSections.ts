import type { GaCardEdition } from "./types";

/** AdvGA / constructed deck sections. */
export type DeckSectionId = "material" | "main" | "sideboard";

export const DECK_SECTIONS: Array<{
  id: DeckSectionId;
  label: string;
  searchHint: string;
}> = [
  {
    id: "material",
    label: "Material Deck",
    searchHint: "Search champions & regalia…",
  },
  {
    id: "main",
    label: "Main Deck",
    searchHint: "Search main deck cards…",
  },
  {
    id: "sideboard",
    label: "Sideboard",
    searchHint: "Search sideboard cards…",
  },
];

function upperTypes(card: { types: string[] }): string[] {
  return (card.types ?? []).map((t) => t.toUpperCase());
}

/**
 * Material deck is Champions and Regalia only (GA constructed rules).
 * Regalia may also be ITEM / WEAPON / ALLY subtypes.
 */
export function isMaterialCard(card: { types: string[] }): boolean {
  const types = upperTypes(card);
  return types.includes("CHAMPION") || types.includes("REGALIA");
}

/** Main / sideboard — everything that is not material-only. */
export function isMainDeckCard(card: { types: string[] }): boolean {
  return !isMaterialCard(card);
}

export function cardAllowedInSection(
  card: { types: string[] },
  section: DeckSectionId,
): boolean {
  if (section === "material") return isMaterialCard(card);
  return isMainDeckCard(card);
}

export function sectionLabel(section: DeckSectionId): string {
  return DECK_SECTIONS.find((s) => s.id === section)?.label ?? section;
}

/** Short type badge for autocomplete rows. */
export function deckCardTypeBadge(card: GaCardEdition): string {
  const types = upperTypes(card);
  if (types.includes("CHAMPION")) return "Champion";
  if (types.includes("REGALIA")) {
    if (types.includes("WEAPON")) return "Regalia · Weapon";
    if (types.includes("ITEM")) return "Regalia · Item";
    return "Regalia";
  }
  if (types.includes("ALLY")) return "Ally";
  if (types.includes("ACTION")) return "Action";
  if (types.includes("ATTACK")) return "Attack";
  if (types.includes("DOMAIN")) return "Domain";
  if (types.includes("PHANTASIA")) return "Phantasia";
  if (types.includes("ITEM")) return "Item";
  if (types.includes("WEAPON")) return "Weapon";
  return types[0] ? types[0].replace(/\b\w/g, (c) => c) : "Card";
}
