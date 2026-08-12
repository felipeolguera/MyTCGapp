import type { CardFinish, GaCardEdition } from "./types.js";
import { searchGaCards } from "./gatcg.js";
import { createCollectionStore } from "./collection.js";
import cors from "cors";
import express, { type Request, type Response } from "express";

export function createApp(
  deps: {
    searchCards?: typeof searchGaCards;
    collection?: ReturnType<typeof createCollectionStore>;
  } = {},
) {
  const app = express();
  const searchCards = deps.searchCards ?? searchGaCards;
  const collection = deps.collection ?? createCollectionStore();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req: Request, res: Response) => {
    const summary = collection.summary();
    res.json({
      status: "ok",
      game: "grand-archive",
      collection: {
        uniqueCards: summary.uniqueCards,
        totalCards: summary.totalCards,
      },
    });
  });

  /** Search Grand Archive by card name (proxied). */
  app.get("/api/ga/search", async (req: Request, res: Response) => {
    const name = String(req.query.name ?? "").trim();
    if (!name) {
      res.status(400).json({ error: "Query param `name` is required" });
      return;
    }

    try {
      const pageSize = Number(req.query.page_size ?? 12);
      const cards = await searchCards(name, Number.isFinite(pageSize) ? pageSize : 12);
      res.json({ cards, count: cards.length });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : "Grand Archive lookup failed",
      });
    }
  });

  app.get("/api/collection", (_req: Request, res: Response) => {
    res.json({ collection: collection.summary() });
  });

  /**
   * Add scanned cards to the collection.
   * Body: { card: GaCardEdition, quantity: number, finish?: "normal"|"foil" }
   */
  app.post("/api/collection", (req: Request, res: Response) => {
    const quantity = Number(req.body?.quantity);
    const card = req.body?.card as GaCardEdition | undefined;
    const finishRaw = String(req.body?.finish ?? "normal");
    const finish: CardFinish = finishRaw === "foil" ? "foil" : "normal";

    if (!card?.editionId || !card?.name) {
      res.status(400).json({ error: "Body must include a card with editionId and name" });
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      res.status(400).json({ error: "quantity must be an integer from 1 to 999" });
      return;
    }

    try {
      const { entry, previousQuantity } = collection.add(card, quantity, finish);
      res.status(201).json({ entry, previousQuantity, collection: collection.summary() });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Could not update collection",
      });
    }
  });

  /** Set absolute quantity (0 removes). Supports changing finish (moves the line). */
  app.put("/api/collection/:id", (req: Request, res: Response) => {
    const quantity = Number(req.body?.quantity);
    const card = req.body?.card as GaCardEdition | undefined;
    const existing = collection.get(req.params.id);
    const finishRaw = String(req.body?.finish ?? existing?.finish ?? "normal");
    const finish: CardFinish = finishRaw === "foil" ? "foil" : "normal";

    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 999) {
      res.status(400).json({ error: "quantity must be an integer from 0 to 999" });
      return;
    }

    const cardPayload = card ?? existing?.card;
    if (!cardPayload) {
      res.status(400).json({ error: "card payload required when entry does not exist" });
      return;
    }

    try {
      const entry = collection.update(req.params.id, cardPayload, quantity, finish);
      res.json({ entry, collection: collection.summary() });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Could not update collection",
      });
    }
  });

  app.delete("/api/collection/:id", (req: Request, res: Response) => {
    const removed = collection.remove(req.params.id);
    if (!removed) {
      res.status(404).json({ error: "Card not in collection" });
      return;
    }
    res.json({ collection: collection.summary() });
  });

  return app;
}
