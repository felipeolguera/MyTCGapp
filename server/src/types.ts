/** Normalized Grand Archive card edition for the client. */
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

export type CardFinish = "normal" | "foil";

export type CardCondition = "NM" | "LP" | "MP" | "HP" | "DMG";

export const CARD_CONDITIONS: CardCondition[] = [
  "NM",
  "LP",
  "MP",
  "HP",
  "DMG",
];

export interface CollectionEntry {
  id: string;
  editionId: string;
  finish: CardFinish;
  quantity: number;
  card: GaCardEdition;
  updatedAt: string;
  forSale: boolean;
  condition: CardCondition;
  askingPrice: number | null;
  note: string;
  binder: string;
  page: number | null;
  slot: number | null;
}

export interface CollectionSummary {
  entries: CollectionEntry[];
  totalCards: number;
  uniqueCards: number;
}

export function collectionEntryId(
  editionId: string,
  finish: CardFinish,
): string {
  return `${editionId}:${finish}`;
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
