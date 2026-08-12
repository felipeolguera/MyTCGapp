import type { CardFinish, CollectionEntry, CollectionSummary, GaCardEdition } from "./types";
import { searchGaCardsDirect } from "./gatcgClient";
import { addLocalCollection, getLocalCollection } from "./localCollection";

/** Native/APK builds talk to GATCG + localStorage; web/dev can use the Express API. */
export function isStandaloneMode(): boolean {
  return import.meta.env.VITE_STANDALONE === "true";
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function searchCards(name: string): Promise<GaCardEdition[]> {
  if (isStandaloneMode()) {
    return searchGaCardsDirect(name, 20);
  }
  const data = await json<{ cards: GaCardEdition[] }>(
    await fetch(`/api/ga/search?name=${encodeURIComponent(name)}`),
  );
  return data.cards;
}

export async function fetchCollection(): Promise<CollectionSummary> {
  if (isStandaloneMode()) {
    return getLocalCollection();
  }
  const data = await json<{ collection: CollectionSummary }>(
    await fetch("/api/collection"),
  );
  return data.collection;
}

export async function addToCollection(
  card: GaCardEdition,
  quantity: number,
  finish: CardFinish = "normal",
): Promise<{ entry: CollectionEntry; collection: CollectionSummary }> {
  if (isStandaloneMode()) {
    return addLocalCollection(card, quantity, finish);
  }
  return json(
    await fetch("/api/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ card, quantity, finish }),
    }),
  );
}
