import { useEffect, useMemo, useState } from "react";
import type { Card, CardElement, Deck } from "./types";
import {
  addCardToDeck,
  createDeck,
  fetchCards,
  fetchDeck,
  fetchDecks,
  removeCardFromDeck,
} from "./api";

const ELEMENTS: (CardElement | "all")[] = [
  "all",
  "fire",
  "water",
  "earth",
  "air",
  "arcane",
];

const ELEMENT_ICON: Record<CardElement, string> = {
  fire: "🔥",
  water: "💧",
  earth: "🌿",
  air: "🌪️",
  arcane: "✨",
};

export function App() {
  const [cards, setCards] = useState<Card[]>([]);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [filter, setFilter] = useState<CardElement | "all">("all");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [allCards, decks] = await Promise.all([fetchCards(), fetchDecks()]);
        setCards(allCards);
        const first = decks[0] ?? (await createDeck("Starter Deck"));
        setDeck(await fetchDeck(first.id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    void bootstrap();
  }, []);

  const visibleCards = useMemo(
    () => (filter === "all" ? cards : cards.filter((c) => c.element === filter)),
    [cards, filter],
  );

  async function handleAdd(card: Card) {
    if (!deck) return;
    setError(null);
    try {
      setDeck(await addCardToDeck(deck.id, card.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add card");
    }
  }

  async function handleRemove(cardId: string) {
    if (!deck) return;
    setError(null);
    try {
      setDeck(await removeCardFromDeck(deck.id, cardId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove card");
    }
  }

  return (
    <div className="app">
      <header className="app__header">
        <h1>
          <span className="app__logo">⚔️</span> MyTCGapp
        </h1>
        <p className="app__subtitle">Trading Card Game — Deck Builder</p>
      </header>

      {error && (
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      )}

      <main className="layout">
        <section className="collection">
          <div className="collection__toolbar">
            <h2>Collection</h2>
            <div className="filters" role="tablist" aria-label="Filter by element">
              {ELEMENTS.map((el) => (
                <button
                  key={el}
                  className={`chip ${filter === el ? "chip--active" : ""}`}
                  onClick={() => setFilter(el)}
                  role="tab"
                  aria-selected={filter === el}
                >
                  {el === "all" ? "All" : `${ELEMENT_ICON[el]} ${el}`}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <p className="muted">Loading cards…</p>
          ) : (
            <div className="card-grid">
              {visibleCards.map((card) => (
                <article
                  key={card.id}
                  className={`card card--${card.element} card--${card.rarity}`}
                >
                  <div className="card__top">
                    <span className="card__cost" title="Mana cost">
                      {card.cost}
                    </span>
                    <span className="card__name">{card.name}</span>
                    <span className="card__element" title={card.element}>
                      {ELEMENT_ICON[card.element]}
                    </span>
                  </div>
                  <p className="card__text">{card.text}</p>
                  <div className="card__footer">
                    <span className={`rarity rarity--${card.rarity}`}>
                      {card.rarity}
                    </span>
                    <span className="stats">
                      <span className="stat stat--atk" title="Attack">
                        ⚔ {card.attack}
                      </span>
                      <span className="stat stat--hp" title="Health">
                        ❤ {card.health}
                      </span>
                    </span>
                  </div>
                  <button
                    className="btn btn--add"
                    onClick={() => handleAdd(card)}
                    aria-label={`Add ${card.name} to deck`}
                  >
                    + Add to deck
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="deck">
          <div className="deck__header">
            <h2>{deck?.name ?? "Deck"}</h2>
            <div className="deck__meta">
              <span className="pill" data-testid="deck-count">
                {deck?.totalCards ?? 0} / 30 cards
              </span>
              <span className="pill">avg cost {deck?.averageCost ?? 0}</span>
            </div>
          </div>

          {deck && deck.cards.length > 0 ? (
            <ul className="deck__list">
              {deck.cards.map((card) => (
                <li key={card.id} className={`deck__item deck__item--${card.element}`}>
                  <span className="deck__cost">{card.cost}</span>
                  <span className="deck__name">
                    {ELEMENT_ICON[card.element]} {card.name}
                  </span>
                  <span className="deck__count">×{card.count}</span>
                  <button
                    className="btn btn--remove"
                    onClick={() => handleRemove(card.id)}
                    aria-label={`Remove ${card.name} from deck`}
                  >
                    −
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted deck__empty">
              Your deck is empty. Add cards from your collection to get started.
            </p>
          )}
        </aside>
      </main>
    </div>
  );
}
