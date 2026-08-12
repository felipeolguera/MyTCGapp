import type { GaCardEdition } from "./types";

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

/** Search Grand Archive directly (used by the Android APK / standalone builds). */
export async function searchGaCardsDirect(
  name: string,
  pageSize = 12,
): Promise<GaCardEdition[]> {
  const query = name.trim();
  if (!query) return [];

  const url = new URL(`${GATCG_BASE}/cards/search`);
  url.searchParams.set("name", query);
  url.searchParams.set("page_size", String(Math.min(Math.max(pageSize, 1), 50)));

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Grand Archive API error (${res.status})`);
  }

  const body = (await res.json()) as { data?: RawCard[] };
  return (body.data ?? []).flatMap((card) => {
    const editions = card.result_editions ?? card.editions ?? [];
    return editions.map((edition) => normalizeEdition(card, edition));
  });
}
