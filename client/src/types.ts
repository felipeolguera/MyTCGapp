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
  /** Binder / box / section label (e.g. Main, Trade, Sale). */
  binder: string;
  /** 1-based page in that binder. */
  page: number | null;
  /** 1-based slot on the page. */
  slot: number | null;
}

export interface CollectionSummary {
  entries: CollectionEntry[];
  totalCards: number;
  uniqueCards: number;
}

export type TabId = "scan" | "collection" | "decks";

export type ScanPhase =
  | "ready"
  | "capturing"
  | "recognizing"
  | "results"
  | "detail"
  | "page";

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

export function normalizeBinderLabel(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, 40);
}

export function normalizeBinderPage(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 999) return null;
  return n;
}

export function normalizeBinderSlot(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 99) return null;
  return n;
}

/** Human location like `Trade · p12/s4` or `p3`. */
export function formatBinderLocation(entry: {
  binder: string;
  page: number | null;
  slot: number | null;
}): string {
  const parts: string[] = [];
  if (entry.binder) parts.push(entry.binder);
  if (entry.page != null && entry.slot != null) {
    parts.push(`p${entry.page}/s${entry.slot}`);
  } else if (entry.page != null) {
    parts.push(`p${entry.page}`);
  } else if (entry.slot != null) {
    parts.push(`s${entry.slot}`);
  }
  return parts.join(" · ");
}
