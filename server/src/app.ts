import express, { type Request, type Response } from "express";
import cors from "cors";
import { createCollectionStore } from "./collection.js";
import { searchGaCards, searchGaCardsBySetCode } from "./gatcg.js";
import type { GaCardEdition } from "./types.js";

export function createApp(
  deps: {
    searchCards?: typeof searchGaCards;
    searchBySetCode?: typeof searchGaCardsBySetCode;
    collection?: ReturnType<typeof createCollectionStore>;
  } = {},
) {
  const app = express();
  const searchCards = deps.searchCards ?? searchGaCards;
  const searchBySetCode = deps.searchBySetCode ?? searchGaCardsBySetCode;
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

  /** Search Grand Archive by card name and/or set code (proxied). */
  app.get("/api/ga/search", async (req: Request, res: Response) => {
    const name = String(req.query.name ?? "").trim();
    const prefix = String(req.query.prefix ?? "").trim();
    const collectorNumber = String(req.query.collector_number ?? "").trim();

    if (!name && !(prefix && collectorNumber)) {
      res.status(400).json({
        error: "Provide `name`, or both `prefix` and `collector_number`",
      });
      return;
    }

    try {
      if (prefix && collectorNumber) {
        const cards = await searchBySetCode(prefix, collectorNumber);
        res.json({ cards, count: cards.length });
        return;
      }

      const pageSize = Number(req.query.page_size ?? 12);
      const cards = await searchCards(
        name,
        Number.isFinite(pageSize) ? pageSize : 12,
      );
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
   * Body: { card: GaCardEdition, quantity: number }
   * Quantity is added to any existing copies of the same edition.
   */
  app.post("/api/collection", (req: Request, res: Response) => {
    const quantity = Number(req.body?.quantity);
    const card = req.body?.card as GaCardEdition | undefined;

    if (!card?.editionId || !card?.name) {
      res.status(400).json({ error: "Body must include a card with editionId and name" });
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      res.status(400).json({ error: "quantity must be an integer from 1 to 999" });
      return;
    }

    try {
      const entry = collection.add(card, quantity);
      res.status(201).json({ entry, collection: collection.summary() });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Could not update collection",
      });
    }
  });

  /** Set absolute quantity (0 removes). */
  app.put("/api/collection/:editionId", (req: Request, res: Response) => {
    const quantity = Number(req.body?.quantity);
    const card = req.body?.card as GaCardEdition | undefined;
    const existing = collection.get(req.params.editionId);

    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 999) {
      res.status(400).json({ error: "quantity must be an integer from 0 to 999" });
      return;
    }

    const cardPayload = card ?? existing?.card;
    if (!cardPayload) {
      res.status(400).json({ error: "card payload required when entry does not exist" });
      return;
    }
    if (cardPayload.editionId !== req.params.editionId) {
      res.status(400).json({ error: "card.editionId must match URL" });
      return;
    }

    try {
      const entry = collection.upsert(cardPayload, quantity);
      res.json({ entry, collection: collection.summary() });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Could not update collection",
      });
    }
  });

  app.delete("/api/collection/:editionId", (req: Request, res: Response) => {
    const removed = collection.remove(req.params.editionId);
    if (!removed) {
      res.status(404).json({ error: "Card not in collection" });
      return;
    }
    res.json({ collection: collection.summary() });
  });

  return app;
}
