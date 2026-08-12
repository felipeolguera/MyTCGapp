import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";

describe("MyTCGapp API", () => {
  const app = createApp();

  it("reports health with card count", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.cards).toBeGreaterThan(0);
  });

  it("lists all cards", async () => {
    const res = await request(app).get("/api/cards");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.cards)).toBe(true);
    expect(res.body.cards.length).toBeGreaterThan(0);
  });

  it("filters cards by element", async () => {
    const res = await request(app).get("/api/cards?element=fire");
    expect(res.status).toBe(200);
    expect(res.body.cards.every((c: { element: string }) => c.element === "fire")).toBe(
      true,
    );
  });

  it("adds and removes a card from a deck with summary stats", async () => {
    const created = await request(app).post("/api/decks").send({ name: "Test Deck" });
    expect(created.status).toBe(201);
    const deckId = created.body.deck.id;

    const added = await request(app)
      .post(`/api/decks/${deckId}/cards`)
      .send({ cardId: "ember-sprite" });
    expect(added.status).toBe(200);
    expect(added.body.deck.totalCards).toBe(1);
    expect(added.body.deck.averageCost).toBe(1);

    const removed = await request(app).delete(
      `/api/decks/${deckId}/cards/ember-sprite`,
    );
    expect(removed.status).toBe(200);
    expect(removed.body.deck.totalCards).toBe(0);
  });

  it("enforces max 3 copies of a card", async () => {
    const created = await request(app).post("/api/decks").send({ name: "Copies" });
    const deckId = created.body.deck.id;
    for (let i = 0; i < 3; i++) {
      await request(app).post(`/api/decks/${deckId}/cards`).send({ cardId: "gale-scout" });
    }
    const overflow = await request(app)
      .post(`/api/decks/${deckId}/cards`)
      .send({ cardId: "gale-scout" });
    expect(overflow.status).toBe(409);
  });
});
