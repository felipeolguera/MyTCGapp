export type CardRarity = "common" | "uncommon" | "rare" | "legendary";

export type CardElement = "fire" | "water" | "earth" | "air" | "arcane";

export interface Card {
  id: string;
  name: string;
  element: CardElement;
  rarity: CardRarity;
  cost: number;
  attack: number;
  health: number;
  text: string;
}

export interface DeckCard extends Card {
  count: number;
}

export interface Deck {
  id: string;
  name: string;
  cards: DeckCard[];
  totalCards: number;
  averageCost: number;
}
