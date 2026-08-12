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

export interface CollectionEntry {
  editionId: string;
  quantity: number;
  card: GaCardEdition;
  updatedAt: string;
}

export interface CollectionSummary {
  entries: CollectionEntry[];
  totalCards: number;
  uniqueCards: number;
}
