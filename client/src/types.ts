export interface GaCardEdition {
  editionId: string;
  cardId: string;
  name: string;
  slug: string;
  types: string[];
  classes: string[];
  element: string | null;
  elements: string[];
  costMemory: number | null;
  costReserve: number | null;
  level: number | null;
  life: number | null;
  power: number | null;
  effect: string | null;
  rarity: number;
  collectorNumber: string;
  imagePath: string;
  imageUrl: string;
  setName: string;
  setPrefix: string;
  illustrator: string | null;
}

/** Physical finish selected when adding to the collection. */
export type CardFinish = "normal" | "foil";

/** Card condition for selling. */
export type CardCondition = "NM" | "LP" | "MP" | "HP" | "DMG";

export const CARD_CONDITIONS: CardCondition[] = [
  "NM",
  "LP",
  "MP",
  "HP",
  "DMG",
];

export interface CollectionEntry {
  /** Composite id: `${editionId}:${finish}` */
  id: string;
  editionId: string;
  finish: CardFinish;
  quantity: number;
  card: GaCardEdition;
  updatedAt: string;
  /** Marked for sale / export subset. */
  forSale: boolean;
  condition: CardCondition;
  /** Optional asking unit price override (USD). */
  askingPrice: number | null;
  /** Freeform buyer/seller note. */
  note: string;
}

export interface CollectionSummary {
  entries: CollectionEntry[];
  totalCards: number;
  uniqueCards: number;
}

export type TabId = "scan" | "collection";

export type ScanPhase =
  | "ready"
  | "capturing"
  | "recognizing"
  | "results"
  | "detail";

export function collectionEntryId(
  editionId: string,
  finish: CardFinish,
): string {
  return `${editionId}:${finish}`;
}

export function finishLabel(finish: CardFinish): string {
  return finish === "foil" ? "Foil" : "Normal";
}

export function normalizeCondition(raw: unknown): CardCondition {
  return CARD_CONDITIONS.includes(raw as CardCondition)
    ? (raw as CardCondition)
    : "NM";
}

export function normalizeAskingPrice(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}
