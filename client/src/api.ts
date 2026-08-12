import type { CollectionEntry, CollectionSummary, GaCardEdition } from "./types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function searchCards(name: string): Promise<GaCardEdition[]> {
  const data = await json<{ cards: GaCardEdition[] }>(
    await fetch(`/api/ga/search?name=${encodeURIComponent(name)}`),
  );
  return data.cards;
}

export async function fetchCollection(): Promise<CollectionSummary> {
  const data = await json<{ collection: CollectionSummary }>(
    await fetch("/api/collection"),
  );
  return data.collection;
}

export async function addToCollection(
  card: GaCardEdition,
  quantity: number,
): Promise<{ entry: CollectionEntry; collection: CollectionSummary }> {
  return json(
    await fetch("/api/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card, quantity }),
    }),
  );
}
