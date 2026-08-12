import express, { type Request, type Response } from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { CARDS, getCardById } from "./cards.js";
import type { Deck, DeckEntry } from "./types.js";

const MAX_COPIES_PER_CARD = 3;
const MAX_DECK_SIZE = 30;

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // In-memory deck store. Seeded with one starter deck.
  const decks = new Map<string, Deck>();
  const starterId = "starter-deck";
  decks.set(starterId, {
    id: starterId,
    name: "Starter Deck",
    entries: [],
  });

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", cards: CARDS.length });
  });

  app.get("/api/cards", (req: Request, res: Response) => {
    const element = String(req.query.element ?? "").toLowerCase();
    const cards = element
      ? CARDS.filter((card) => card.element === element)
      : CARDS;
    res.json({ cards });
  });

  app.get("/api/cards/:id", (req: Request, res: Response) => {
    const card = getCardById(req.params.id);
    if (!card) {
      res.status(404).json({ error: "Card not found" });
      return;
    }
    res.json({ card });
  });

  app.get("/api/decks", (_req: Request, res: Response) => {
    res.json({ decks: [...decks.values()] });
  });

  app.get("/api/decks/:id", (req: Request, res: Response) => {
    const deck = decks.get(req.params.id);
    if (!deck) {
      res.status(404).json({ error: "Deck not found" });
      return;
    }
    res.json({ deck: decorateDeck(deck) });
  });

  app.post("/api/decks", (req: Request, res: Response) => {
    const name = String(req.body?.name ?? "").trim() || "New Deck";
    const deck: Deck = { id: randomUUID(), name, entries: [] };
    decks.set(deck.id, deck);
    res.status(201).json({ deck: decorateDeck(deck) });
  });

  // Add a single copy of a card to a deck.
  app.post("/api/decks/:id/cards", (req: Request, res: Response) => {
    const deck = decks.get(req.params.id);
    if (!deck) {
      res.status(404).json({ error: "Deck not found" });
      return;
    }
    const cardId = String(req.body?.cardId ?? "");
    if (!getCardById(cardId)) {
      res.status(400).json({ error: "Unknown cardId" });
      return;
    }

    const totalCards = deck.entries.reduce((sum, e) => sum + e.count, 0);
    if (totalCards >= MAX_DECK_SIZE) {
      res.status(409).json({ error: `Deck is full (max ${MAX_DECK_SIZE} cards)` });
      return;
    }

    const existing = deck.entries.find((e) => e.cardId === cardId);
    if (existing) {
      if (existing.count >= MAX_COPIES_PER_CARD) {
        res
          .status(409)
          .json({ error: `Max ${MAX_COPIES_PER_CARD} copies of a card allowed` });
        return;
      }
      existing.count += 1;
    } else {
      deck.entries.push({ cardId, count: 1 });
    }

    res.json({ deck: decorateDeck(deck) });
  });

  // Remove a single copy of a card from a deck.
  app.delete("/api/decks/:id/cards/:cardId", (req: Request, res: Response) => {
    const deck = decks.get(req.params.id);
    if (!deck) {
      res.status(404).json({ error: "Deck not found" });
      return;
    }
    const entry = deck.entries.find((e) => e.cardId === req.params.cardId);
    if (!entry) {
      res.status(404).json({ error: "Card not in deck" });
      return;
    }
    entry.count -= 1;
    if (entry.count <= 0) {
      deck.entries = deck.entries.filter((e) => e.cardId !== req.params.cardId);
    }
    res.json({ deck: decorateDeck(deck) });
  });

  return app;
}

// Expand deck entries with full card data and summary stats for the client.
function decorateDeck(deck: Deck) {
  const cards = deck.entries
    .map((entry: DeckEntry) => {
      const card = getCardById(entry.cardId);
      return card ? { ...card, count: entry.count } : null;
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const totalCards = cards.reduce((sum, c) => sum + c.count, 0);
  const averageCost =
    totalCards === 0
      ? 0
      : Number(
          (
            cards.reduce((sum, c) => sum + c.cost * c.count, 0) / totalCards
          ).toFixed(2),
        );

  return {
    id: deck.id,
    name: deck.name,
    cards,
    totalCards,
    averageCost,
  };
}
