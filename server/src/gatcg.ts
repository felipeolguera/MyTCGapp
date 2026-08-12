import type { GaCardEdition } from "./types.js";

const GATCG_BASE = "https://api.gatcg.com";

interface RawEdition {
  uuid: string;
  card_id: string;
  slug: string;
  rarity: number;
  collector_number: string;
  image: string;
  illustrator?: string | null;
  set?: {
    name?: string;
    prefix?: string;
  };
}

interface RawCard {
  uuid: string;
  name: string;
  slug: string;
  types?: string[];
  classes?: string[];
  element?: string | null;
  elements?: string[];
  cost_memory?: number | null;
  cost_reserve?: number | null;
  level?: number | null;
  life?: number | null;
  power?: number | null;
  effect?: string | null;
  editions?: RawEdition[];
  result_editions?: RawEdition[];
}

interface SearchResponse {
  data?: RawCard[];
}

function normalizeEdition(card: RawCard, edition: RawEdition): GaCardEdition {
  const imagePath = edition.image.startsWith("/")
    ? edition.image
    : `/cards/images/${edition.image}`;
  return {
    editionId: edition.uuid,
    cardId: card.uuid,
    name: card.name,
    slug: edition.slug || card.slug,
    types: card.types ?? [],
    classes: card.classes ?? [],
    element: card.element ?? null,
    elements: card.elements ?? [],
    costMemory: card.cost_memory ?? null,
    costReserve: card.cost_reserve ?? null,
    level: card.level ?? null,
    life: card.life ?? null,
    power: card.power ?? null,
    effect: card.effect ?? null,
    rarity: edition.rarity,
    collectorNumber: edition.collector_number,
    imagePath,
    imageUrl: `${GATCG_BASE}${imagePath}`,
    setName: edition.set?.name ?? "Unknown set",
    setPrefix: edition.set?.prefix ?? "",
    illustrator: edition.illustrator ?? null,
  };
}

function flattenCard(card: RawCard): GaCardEdition[] {
  const editions = card.result_editions ?? card.editions ?? [];
  return editions.map((edition) => normalizeEdition(card, edition));
}

async function fetchSearch(url: URL): Promise<GaCardEdition[]> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Grand Archive API error (${res.status})`);
  }
  const body = (await res.json()) as SearchResponse;
  return (body.data ?? []).flatMap(flattenCard);
}

export async function searchGaCards(
  name: string,
  pageSize = 10,
): Promise<GaCardEdition[]> {
  const query = name.trim();
  if (!query) return [];

  const url = new URL(`${GATCG_BASE}/cards/search`);
  url.searchParams.set("name", query);
  url.searchParams.set("page_size", String(Math.min(Math.max(pageSize, 1), 50)));
  return fetchSearch(url);
}

export async function searchGaCardsBySetCode(
  prefix: string,
  collectorNumber: string,
): Promise<GaCardEdition[]> {
  const url = new URL(`${GATCG_BASE}/cards/search`);
  url.searchParams.append("prefix", prefix);
  url.searchParams.set("collector_number", collectorNumber);
  url.searchParams.set("page_size", "10");
  const cards = await fetchSearch(url);
  return cards.filter(
    (c) =>
      c.setPrefix.toUpperCase() === prefix.toUpperCase() &&
      c.collectorNumber.replace(/^0+/, "") ===
        collectorNumber.replace(/^0+/, ""),
  );
}
