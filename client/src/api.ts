import type { Card, Deck } from "./types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchCards(element?: string): Promise<Card[]> {
  const query = element ? `?element=${encodeURIComponent(element)}` : "";
  const data = await json<{ cards: Card[] }>(await fetch(`/api/cards${query}`));
  return data.cards;
}

export async function fetchDecks(): Promise<{ id: string; name: string }[]> {
  const data = await json<{ decks: { id: string; name: string }[] }>(
    await fetch("/api/decks"),
  );
  return data.decks;
}

export async function fetchDeck(id: string): Promise<Deck> {
  const data = await json<{ deck: Deck }>(await fetch(`/api/decks/${id}`));
  return data.deck;
}

export async function createDeck(name: string): Promise<Deck> {
  const data = await json<{ deck: Deck }>(
    await fetch("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  );
  return data.deck;
}

export async function addCardToDeck(deckId: string, cardId: string): Promise<Deck> {
  const data = await json<{ deck: Deck }>(
    await fetch(`/api/decks/${deckId}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cardId }),
    }),
  );
  return data.deck;
}

export async function removeCardFromDeck(
  deckId: string,
  cardId: string,
): Promise<Deck> {
  const data = await json<{ deck: Deck }>(
    await fetch(`/api/decks/${deckId}/cards/${cardId}`, { method: "DELETE" }),
  );
  return data.deck;
}
