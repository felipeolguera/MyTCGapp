import { useEffect, useMemo, useState } from "react";
import {
  importDecklistToBinder,
  searchCardsForDeckSection,
} from "./api";
import {
  DECK_SECTIONS,
  deckCardTypeBadge,
  sectionLabel,
  type DeckSectionId,
} from "./deckSections";
import {
  finishToPrinting,
  formatUsd,
  loadPriceIndex,
  lookupCardPrice,
  type PriceIndex,
} from "./prices";
import type { GaCardEdition } from "./types";

interface DeckLine {
  card: GaCardEdition;
  quantity: number;
  section: DeckSectionId;
}

interface DeckBuilderViewProps {
  onStatus?: (message: string | null) => void;
  onError?: (message: string | null) => void;
  onSavedToBinder?: (binder: string) => void;
}

const STORAGE_KEY = "archive-binder.deck-draft.v1";
const SEARCH_LIMIT = 15;

function loadDraft(): { name: string; lines: DeckLine[] } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { name: "", lines: [] };
    const parsed = JSON.parse(raw) as { name?: string; lines?: DeckLine[] };
    return {
      name: typeof parsed.name === "string" ? parsed.name.slice(0, 40) : "",
      lines: Array.isArray(parsed.lines) ? parsed.lines : [],
    };
  } catch {
    return { name: "", lines: [] };
  }
}

export function DeckBuilderView({
  onStatus,
  onError,
  onSavedToBinder,
}: DeckBuilderViewProps) {
  const draft = useMemo(() => loadDraft(), []);
  const [name, setName] = useState(draft.name);
  const [lines, setLines] = useState<DeckLine[]>(draft.lines);
  const [activeSection, setActiveSection] =
    useState<DeckSectionId>("material");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GaCardEdition[]>([]);
  const [searching, setSearching] = useState(false);
  const [priceIndex, setPriceIndex] = useState<PriceIndex | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadPriceIndex()
      .then(setPriceIndex)
      .catch(() => setPriceIndex(null));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ name, lines }));
  }, [name, lines]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) {
      setHits([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = window.setTimeout(() => {
      void searchCardsForDeckSection(q, activeSection, SEARCH_LIMIT).then(
        (cards) => {
          if (cancelled) return;
          setHits(cards);
          setSearching(false);
        },
      );
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, activeSection]);

  const sectionLines = useMemo(() => {
    const map: Record<DeckSectionId, DeckLine[]> = {
      material: [],
      main: [],
      sideboard: [],
    };
    for (const line of lines) map[line.section].push(line);
    return map;
  }, [lines]);

  const worth = useMemo(() => {
    let total = 0;
    let priced = 0;
    for (const line of lines) {
      const price = priceIndex
        ? lookupCardPrice(priceIndex, line.card, finishToPrinting("normal"))
        : null;
      if (price?.market != null) {
        total += price.market * line.quantity;
        priced += line.quantity;
      }
    }
    return { total: Math.round(total * 100) / 100, priced };
  }, [lines, priceIndex]);

  const materialCount = sectionLines.material.reduce(
    (s, l) => s + l.quantity,
    0,
  );
  const mainCount = sectionLines.main.reduce((s, l) => s + l.quantity, 0);

  function addCard(card: GaCardEdition) {
    setLines((prev) => {
      const existing = prev.find(
        (l) =>
          l.section === activeSection && l.card.cardId === card.cardId,
      );
      if (existing) {
        const max = activeSection === "material" ? 1 : 4;
        if (existing.quantity >= max) return prev;
        return prev.map((l) =>
          l === existing ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...prev, { card, quantity: 1, section: activeSection }];
    });
    setQuery("");
    setHits([]);
  }

  function bump(line: DeckLine, delta: number) {
    setLines((prev) =>
      prev
        .map((l) => {
          if (
            l.section !== line.section ||
            l.card.cardId !== line.card.cardId
          ) {
            return l;
          }
          const max = line.section === "material" ? 1 : 4;
          const next = Math.min(max, Math.max(0, l.quantity + delta));
          return { ...l, quantity: next };
        })
        .filter((l) => l.quantity > 0),
    );
  }

  function clearDeck() {
    if (!window.confirm("Clear this draft deck?")) return;
    setLines([]);
    setName("");
  }

  async function saveToBinder() {
    if (lines.length === 0) {
      onError?.("Add some cards first");
      return;
    }
    const binder = (name.trim() || "Draft deck").slice(0, 40);
    setSaving(true);
    onError?.(null);
    try {
      const items = lines.map((l) => ({
        card: l.card,
        quantity: l.quantity,
        section: sectionLabel(l.section),
      }));
      const result = await importDecklistToBinder(items, binder, "normal");
      onStatus?.(
        `Saved “${binder}” · ${result.imported} cards · ~${formatUsd(worth.total)}`,
      );
      onSavedToBinder?.(binder);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Could not save deck");
    } finally {
      setSaving(false);
    }
  }

  const activeMeta = DECK_SECTIONS.find((s) => s.id === activeSection)!;
  const showHits = query.trim().length >= 1;

  return (
    <section className="deck-builder">
      <header className="deck-builder__header">
        <label className="deck-builder__name">
          <span className="muted">Deck name</span>
          <input
            type="text"
            value={name}
            maxLength={40}
            placeholder="Obla"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <p className="deck-builder__worth">
          <span className="muted">Worth</span>
          <strong>{formatUsd(worth.total)}</strong>
        </p>
      </header>

      <p className="muted deck-builder__meta">
        Material {materialCount}/12 · Main {mainCount}
        {worth.priced > 0 ? ` · ${worth.priced} priced` : ""}
      </p>

      <div className="deck-builder__tabs" role="tablist" aria-label="Deck section">
        {DECK_SECTIONS.map((section) => {
          const count = sectionLines[section.id].reduce(
            (s, l) => s + l.quantity,
            0,
          );
          return (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={activeSection === section.id}
              className={
                activeSection === section.id
                  ? "deck-builder__tab deck-builder__tab--active"
                  : "deck-builder__tab"
              }
              onClick={() => {
                setActiveSection(section.id);
                setQuery("");
                setHits([]);
              }}
            >
              {section.label}
              {count > 0 ? ` (${count})` : ""}
            </button>
          );
        })}
      </div>

      <div className="deck-builder__search">
        <label className="deck-builder__search-field">
          <span className="visually-hidden">{activeMeta.label} search</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={activeMeta.searchHint}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
          />
        </label>
        {activeSection === "material" && (
          <p className="muted deck-builder__filter-hint">
            Showing champions &amp; regalia only
          </p>
        )}
        {showHits && (
          <div
            className="deck-builder__hits"
            role="listbox"
            aria-label="Search results"
          >
            {searching && hits.length === 0 ? (
              <p className="muted deck-builder__hits-empty">Searching…</p>
            ) : hits.length === 0 ? (
              <p className="muted deck-builder__hits-empty">No matches</p>
            ) : (
              <ul className="deck-builder__hit-grid">
                {hits.map((card) => (
                  <li key={card.editionId}>
                    <button
                      type="button"
                      className="deck-builder__hit"
                      onClick={() => addCard(card)}
                      title={`${card.name} · ${deckCardTypeBadge(card)}`}
                    >
                      <img
                        src={card.imageUrl}
                        alt={card.name}
                        loading="lazy"
                      />
                      <span className="deck-builder__hit-name">{card.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <ul className="deck-builder__list">
        {sectionLines[activeSection].length === 0 ? (
          <li className="muted deck-builder__empty">
            {activeSection === "material"
              ? "Search to add champions and regalia"
              : "Search to add cards"}
          </li>
        ) : (
          sectionLines[activeSection].map((line) => {
            const unit = priceIndex
              ? lookupCardPrice(
                  priceIndex,
                  line.card,
                  finishToPrinting("normal"),
                )?.market ?? null
              : null;
            return (
              <li
                key={`${line.section}:${line.card.cardId}`}
                className="deck-builder__line"
              >
                <img
                  className="deck-builder__thumb"
                  src={line.card.imageUrl}
                  alt=""
                  loading="lazy"
                />
                <div className="deck-builder__line-main">
                  <strong>{line.card.name}</strong>
                  <span className="muted">
                    {deckCardTypeBadge(line.card)} · {line.card.setPrefix}
                    {unit != null ? ` · ${formatUsd(unit)}` : ""}
                  </span>
                </div>
                <div className="deck-builder__qty">
                  <button
                    type="button"
                    className="btn btn--ghost btn--compact"
                    onClick={() => bump(line, -1)}
                    aria-label="Decrease"
                  >
                    −
                  </button>
                  <span>{line.quantity}</span>
                  <button
                    type="button"
                    className="btn btn--ghost btn--compact"
                    onClick={() => bump(line, 1)}
                    aria-label="Increase"
                    disabled={
                      line.section === "material"
                        ? line.quantity >= 1
                        : line.quantity >= 4
                    }
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })
        )}
      </ul>

      <div className="deck-builder__actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={saving || lines.length === 0}
          onClick={() => void saveToBinder()}
        >
          {saving ? "Saving…" : "Save to binder"}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          disabled={lines.length === 0 && !name}
          onClick={clearDeck}
        >
          Clear
        </button>
      </div>
    </section>
  );
}
