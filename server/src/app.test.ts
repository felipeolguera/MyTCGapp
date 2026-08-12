import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import type { GaCardEdition } from "./types.js";

const sampleCard: GaCardEdition = {
  editionId: "ed-slime-001",
  cardId: "card-slime",
  name: "Spirit of Slime",
  slug: "spirit-of-slime-rec-slm",
  types: ["CHAMPION"],
  classes: ["SPIRIT"],
  element: "NORM",
  elements: ["NORM"],
  costMemory: 0,
  costReserve: null,
  level: 0,
  life: 15,
  power: null,
  effect: "On Enter: Draw seven cards.",
  rarity: 1,
  collectorNumber: "001",
  imagePath: "/cards/images/oldrleovjj.jpg",
  imageUrl: "https://api.gatcg.com/cards/images/oldrleovjj.jpg",
  setName: "Re:Collection Slime Sovereign",
  setPrefix: "ReC-SLM",
  illustrator: "木叶",
};

describe("Grand Archive collection API", () => {
  it("reports health with empty collection", async () => {
    const app = createApp({
      searchCards: vi.fn(async () => []),
    });
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.game).toBe("grand-archive");
    expect(res.body.collection.totalCards).toBe(0);
  });

  it("requires a name for GA search", async () => {
    const app = createApp({ searchCards: vi.fn(async () => []) });
    const res = await request(app).get("/api/ga/search");
    expect(res.status).toBe(400);
  });

  it("proxies GA card search results", async () => {
    const searchCards = vi.fn(async () => [sampleCard]);
    const app = createApp({ searchCards });
    const res = await request(app).get("/api/ga/search?name=slime");
    expect(res.status).toBe(200);
    expect(searchCards).toHaveBeenCalledWith("slime", 12);
    expect(res.body.cards[0].name).toBe("Spirit of Slime");
  });

  it("adds quantity to collection and aggregates copies", async () => {
    const app = createApp({ searchCards: vi.fn(async () => []) });

    const first = await request(app)
      .post("/api/collection")
      .send({ card: sampleCard, quantity: 2 });
    expect(first.status).toBe(201);
    expect(first.body.entry.quantity).toBe(2);
    expect(first.body.entry.finish).toBe("normal");
    expect(first.body.collection.totalCards).toBe(2);

    const second = await request(app)
      .post("/api/collection")
      .send({ card: sampleCard, quantity: 3 });
    expect(second.status).toBe(201);
    expect(second.body.entry.quantity).toBe(5);
    expect(second.body.collection.uniqueCards).toBe(1);
    expect(second.body.collection.totalCards).toBe(5);
  });

  it("tracks foil and normal as separate entries", async () => {
    const app = createApp({ searchCards: vi.fn(async () => []) });
    await request(app)
      .post("/api/collection")
      .send({ card: sampleCard, quantity: 1, finish: "normal" });
    const foil = await request(app)
      .post("/api/collection")
      .send({ card: sampleCard, quantity: 2, finish: "foil" });
    expect(foil.status).toBe(201);
    expect(foil.body.entry.finish).toBe("foil");
    expect(foil.body.entry.quantity).toBe(2);
    expect(foil.body.collection.uniqueCards).toBe(2);
    expect(foil.body.collection.totalCards).toBe(3);
  });

  it("rejects invalid quantity on add", async () => {
    const app = createApp({ searchCards: vi.fn(async () => []) });
    const res = await request(app)
      .post("/api/collection")
      .send({ card: sampleCard, quantity: 0 });
    expect(res.status).toBe(400);
  });

  it("sets absolute quantity and removes at zero", async () => {
    const app = createApp({ searchCards: vi.fn(async () => []) });
    const created = await request(app)
      .post("/api/collection")
      .send({ card: sampleCard, quantity: 4 });
    const id = created.body.entry.id as string;

    const updated = await request(app)
      .put(`/api/collection/${id}`)
      .send({ quantity: 1, finish: "normal", card: sampleCard });
    expect(updated.status).toBe(200);
    expect(updated.body.entry.quantity).toBe(1);

    const cleared = await request(app)
      .put(`/api/collection/${id}`)
      .send({ quantity: 0, finish: "normal", card: sampleCard });
    expect(cleared.status).toBe(200);
    expect(cleared.body.collection.uniqueCards).toBe(0);
  });

  it("returns previousQuantity for undo support", async () => {
    const app = createApp({ searchCards: vi.fn(async () => []) });
    const first = await request(app)
      .post("/api/collection")
      .send({ card: sampleCard, quantity: 2 });
    expect(first.body.previousQuantity).toBe(0);

    const second = await request(app)
      .post("/api/collection")
      .send({ card: sampleCard, quantity: 3 });
    expect(second.body.previousQuantity).toBe(2);
    expect(second.body.entry.quantity).toBe(5);
  });

  it("moves an entry when finish changes on update", async () => {
    const app = createApp({ searchCards: vi.fn(async () => []) });
    const created = await request(app)
      .post("/api/collection")
      .send({ card: sampleCard, quantity: 4, finish: "normal" });
    const id = created.body.entry.id as string;

    const moved = await request(app)
      .put(`/api/collection/${encodeURIComponent(id)}`)
      .send({ quantity: 4, finish: "foil", card: sampleCard });
    expect(moved.status).toBe(200);
    expect(moved.body.entry.finish).toBe("foil");
    expect(moved.body.entry.id).toBe(`${sampleCard.editionId}:foil`);
    expect(moved.body.collection.uniqueCards).toBe(1);
    expect(moved.body.collection.entries[0].finish).toBe("foil");
  });

  it("deletes a collection entry", async () => {
    const app = createApp({ searchCards: vi.fn(async () => []) });
    const created = await request(app)
      .post("/api/collection")
      .send({ card: sampleCard, quantity: 1 });
    const id = created.body.entry.id as string;
    const res = await request(app).delete(`/api/collection/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.collection.totalCards).toBe(0);
  });
});
