import type { CardCondition, CardFinish, GaCardEdition } from "./types.js";
import { normalizeAskingPrice, normalizeBinderLabel, normalizeBinderPage, normalizeBinderSlot, normalizeCondition } from "./types.js";
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
  app.use(express.json({ limit: "4mb" }));

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

  app.get("/api/ga/search", async (req: Request, res: Response) => {
    const name = String(req.query.name ?? "").trim();
    if (!name) {
      res.status(400).json({ error: "Query param `name` is required" });
      return;
    }

    try {
      const pageSize = Number(req.query.page_size ?? 12);
      const cards = await searchCards(
        name,
        Number.isFinite(pageSize) ? pageSize : 12,
      );
      res.json({ cards, count: cards.length });
    } catch (err) {
      res.status(502).json({
        error:
          err instanceof Error ? err.message : "Grand Archive lookup failed",
      });
    }
  });

  app.get("/api/collection", (_req: Request, res: Response) => {
    res.json({ collection: collection.summary() });
  });

  app.post("/api/collection", (req: Request, res: Response) => {
    const quantity = Number(req.body?.quantity);
    const card = req.body?.card as GaCardEdition | undefined;
    const finishRaw = String(req.body?.finish ?? "normal");
    const finish: CardFinish = finishRaw === "foil" ? "foil" : "normal";

    if (!card?.editionId || !card?.name) {
      res
        .status(400)
        .json({ error: "Body must include a card with editionId and name" });
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      res
        .status(400)
        .json({ error: "quantity must be an integer from 1 to 999" });
      return;
    }

    try {
      const forSale =
        req.body?.forSale === undefined ? undefined : Boolean(req.body.forSale);
      const condition =
        req.body?.condition === undefined
          ? undefined
          : (normalizeCondition(req.body.condition) as CardCondition);
      const askingPrice =
        req.body?.askingPrice === undefined
          ? undefined
          : normalizeAskingPrice(req.body.askingPrice);
      const binder =
        req.body?.binder === undefined
          ? undefined
          : normalizeBinderLabel(req.body.binder);
      const page =
        req.body?.page === undefined
          ? undefined
          : normalizeBinderPage(req.body.page);
      const slot =
        req.body?.slot === undefined
          ? undefined
          : normalizeBinderSlot(req.body.slot);
      const { entry, previousQuantity } = collection.add(
        card,
        quantity,
        finish,
        { forSale, condition, askingPrice, binder, page, slot },
      );
      res
        .status(201)
        .json({ entry, previousQuantity, collection: collection.summary() });
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error ? err.message : "Could not update collection",
      });
    }
  });

  app.put("/api/collection", (req: Request, res: Response) => {
    const entries = req.body?.entries;
    if (!Array.isArray(entries)) {
      res.status(400).json({ error: "Body must include entries array" });
      return;
    }
    try {
      const next = collection.replaceAll(entries);
      res.json({ collection: next });
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error ? err.message : "Could not restore collection",
      });
    }
  });

  app.post("/api/collection/bulk-sale", (req: Request, res: Response) => {
    const ids = req.body?.ids;
    const forSale = Boolean(req.body?.forSale);
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
      res.status(400).json({ error: "Body must include ids: string[]" });
      return;
    }
    const next = collection.bulkSetForSale(ids, forSale);
    res.json({ collection: next });
  });

  app.post("/api/collection/bulk-delete", (req: Request, res: Response) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
      res.status(400).json({ error: "Body must include ids: string[]" });
      return;
    }
    const next = collection.bulkRemove(ids);
    res.json({ collection: next });
  });

  app.put("/api/collection/:id", (req: Request, res: Response) => {
    const quantity = Number(req.body?.quantity);
    const card = req.body?.card as GaCardEdition | undefined;
    const existing = collection.get(req.params.id);
    const finishRaw = String(req.body?.finish ?? existing?.finish ?? "normal");
    const finish: CardFinish = finishRaw === "foil" ? "foil" : "normal";
    const forSale =
      req.body?.forSale === undefined ? undefined : Boolean(req.body.forSale);
    const condition =
      req.body?.condition === undefined
        ? undefined
        : (normalizeCondition(req.body.condition) as CardCondition);
    const askingPrice =
      req.body?.askingPrice === undefined
        ? undefined
        : normalizeAskingPrice(req.body.askingPrice);
    const note =
      req.body?.note === undefined
        ? undefined
        : String(req.body.note).slice(0, 280);
    const binder =
      req.body?.binder === undefined
        ? undefined
        : normalizeBinderLabel(req.body.binder);
    const page =
      req.body?.page === undefined
        ? undefined
        : normalizeBinderPage(req.body.page);
    const slot =
      req.body?.slot === undefined
        ? undefined
        : normalizeBinderSlot(req.body.slot);

    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 999) {
      res
        .status(400)
        .json({ error: "quantity must be an integer from 0 to 999" });
      return;
    }

    const cardPayload = card ?? existing?.card;
    if (!cardPayload) {
      res
        .status(400)
        .json({ error: "card payload required when entry does not exist" });
      return;
    }

    try {
      const entry = collection.update(req.params.id, {
        card: cardPayload,
        quantity,
        finish,
        forSale,
        condition,
        askingPrice,
        note,
        binder,
        page,
        slot,
      });
      res.json({ entry, collection: collection.summary() });
    } catch (err) {
      res.status(400).json({
        error:
          err instanceof Error ? err.message : "Could not update collection",
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
