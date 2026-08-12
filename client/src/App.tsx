import { useCallback, useEffect, useState } from "react";
import { addToCollection, fetchCollection, searchCards } from "./api";
import { CameraCapture } from "./CameraCapture";
import { CardDetail } from "./CardDetail";
import { CollectionView } from "./CollectionView";
import { loadCardIndex, matchCardVisually } from "./visualMatch";
import type {
  CollectionSummary,
  CardFinish,
  GaCardEdition,
  ScanPhase,
  TabId,
} from "./types";

export function App() {
  const [tab, setTab] = useState<TabId>("scan");
  const [phase, setPhase] = useState<ScanPhase>("ready");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GaCardEdition[]>([]);
  const [matchScores, setMatchScores] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<GaCardEdition | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [finish, setFinish] = useState<CardFinish>("normal");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [indexReady, setIndexReady] = useState(false);
  const [collection, setCollection] = useState<CollectionSummary | null>(null);
  const [collectionLoading, setCollectionLoading] = useState(true);
  const [sessionAdds, setSessionAdds] = useState(0);

  const refreshCollection = useCallback(async () => {
    setCollectionLoading(true);
    try {
      setCollection(await fetchCollection());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load collection");
    } finally {
      setCollectionLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshCollection();
  }, [refreshCollection]);

  useEffect(() => {
    void loadCardIndex()
      .then((idx) => {
        setIndexReady(true);
        setStatus(`Visual index ready (${idx.total} printings)`);
      })
      .catch(() => {
        setIndexReady(false);
        setStatus("Visual index unavailable — use name search");
      });
  }, []);

  function resetScan(keepStatus = false) {
    setPhase("ready");
    setSelected(null);
    setResults([]);
    setMatchScores({});
    setQuantity("1");
    setFinish("normal");
    setBusy(false);
    setSaving(false);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (!keepStatus) setStatus(null);
  }

  function applyVisualMatches(
    matches: { card: GaCardEdition; score: number; distance: number }[],
  ) {
    const cards = matches.map((m) => m.card);
    const scores: Record<string, number> = {};
    for (const m of matches) scores[m.card.editionId] = m.score;
    setMatchScores(scores);
    setResults(cards);

    if (cards.length === 0) {
      setPhase("results");
      setStatus("No visual match — try a flatter photo or search by name");
      return;
    }

    setQuery(cards[0].name);
    const best = matches[0];
    if (best.distance <= 12 && cards.length === 1) {
      setSelected(cards[0]);
      setPhase("detail");
      setQuantity("1");
      setFinish("normal");
      setStatus(`Matched “${cards[0].name}” (${Math.round(best.score * 100)}%)`);
      return;
    }
    if (best.distance <= 10 && best.score >= 0.82) {
      setSelected(cards[0]);
      setPhase("detail");
      setQuantity("1");
      setFinish("normal");
      setStatus(`Matched “${cards[0].name}” (${Math.round(best.score * 100)}%)`);
      return;
    }

    setPhase("results");
    setStatus(
      `Top ${cards.length} visual match${cards.length === 1 ? "" : "es"} — pick yours`,
    );
  }

  async function runSearch(name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a card name to search.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(`Looking up “${trimmed}”…`);
    try {
      const cards = await searchCards(trimmed);
      // Prefer unique cards, keep first edition of each name/cardId
      const seen = new Set<string>();
      const unique: GaCardEdition[] = [];
      for (const c of cards) {
        if (seen.has(c.cardId)) continue;
        seen.add(c.cardId);
        unique.push(c);
        if (unique.length >= 12) break;
      }
      setMatchScores({});
      setResults(unique);
      setPhase("results");
      setStatus(
        unique.length
          ? `${unique.length} card${unique.length === 1 ? "" : "s"} found`
          : "No matches — try another name",
      );
      if (unique.length === 1) {
        setSelected(unique[0]);
        setPhase("detail");
        setQuantity("1");
        setFinish("normal");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleCapture(blob: Blob, url: string) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(url);
    setPhase("recognizing");
    setBusy(true);
    setError(null);
    setStatus("Comparing card art to Grand Archive…");

    try {
      const matches = await matchCardVisually(blob, {
        limit: 5,
        maxDistance: 40,
      });
      applyVisualMatches(matches);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Visual match failed — try name search.",
      );
      setPhase("ready");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveNext() {
    if (!selected) return;
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      setError("Enter a quantity from 1–999");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const { collection: next } = await addToCollection(selected, qty, finish);
      setCollection(next);
      setSessionAdds((n) => n + qty);
      setStatus(
        `Added ×${qty} ${selected.name} (${finish === "foil" ? "Foil" : "Normal"})`,
      );
      resetScan(true);
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="brand">Archive Binder</p>
          <h1>Grand Archive</h1>
        </div>
        <div className="topbar__stats">
          <span>{collection?.totalCards ?? 0} owned</span>
          <span>{sessionAdds} this session</span>
        </div>
      </header>

      {error && (
        <div className="banner banner--error" role="alert">
          {error}
        </div>
      )}
      {status && !error && <div className="banner banner--status">{status}</div>}

      <main className="main">
        {tab === "scan" && (
          <>
            {phase === "detail" && selected ? (
              <CardDetail
                card={selected}
                quantity={quantity}
                finish={finish}
                onQuantityChange={setQuantity}
                onFinishChange={setFinish}
                onSaveNext={() => void handleSaveNext()}
                onBack={() => {
                  setSelected(null);
                  setPhase(results.length ? "results" : "ready");
                }}
                saving={saving}
              />
            ) : (
              <section className="scan">
                <CameraCapture
                  onCapture={(blob, url) => void handleCapture(blob, url)}
                  disabled={busy || !indexReady}
                />

                {previewUrl && (
                  <img
                    src={previewUrl}
                    alt="Last capture"
                    className="scan__preview"
                  />
                )}

                <form
                  className="search"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void runSearch(query);
                  }}
                >
                  <label className="search__label" htmlFor="card-query">
                    Or search by exact card name
                  </label>
                  <div className="search__row">
                    <input
                      id="card-query"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="e.g. Spirit of Slime"
                      autoComplete="off"
                      enterKeyHint="search"
                    />
                    <button
                      type="submit"
                      className="btn btn--primary"
                      disabled={busy}
                    >
                      Search
                    </button>
                  </div>
                </form>

                {phase === "recognizing" && (
                  <p className="muted pulse">Matching card art…</p>
                )}

                {phase === "results" && (
                  <>
                    <ul className="results">
                      {results.map((card) => (
                        <li key={card.editionId}>
                          <button
                            type="button"
                            className="result"
                            onClick={() => {
                              setSelected(card);
                              setQuantity("1");
                              setFinish("normal");
                              setPhase("detail");
                              setStatus(null);
                            }}
                          >
                            <img src={card.imageUrl} alt="" loading="lazy" />
                            <span>
                              <strong>{card.name}</strong>
                              <small>
                                {card.setPrefix} #{card.collectorNumber}
                                {matchScores[card.editionId] != null
                                  ? ` · ${Math.round(matchScores[card.editionId] * 100)}%`
                                  : ""}
                              </small>
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    {results.length > 0 && (
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => {
                          setResults([]);
                          setMatchScores({});
                          setStatus(
                            "None matched — retake with even lighting or search by name",
                          );
                        }}
                      >
                        None of these
                      </button>
                    )}
                  </>
                )}
              </section>
            )}
          </>
        )}

        {tab === "collection" && (
          <CollectionView
            collection={collection}
            loading={collectionLoading}
            onRefresh={() => void refreshCollection()}
            onStatus={setStatus}
            onError={setError}
          />
        )}
      </main>

      <nav className="tabbar" aria-label="Primary">
        <button
          type="button"
          className={tab === "scan" ? "tab tab--active" : "tab"}
          onClick={() => setTab("scan")}
        >
          Scan
        </button>
        <button
          type="button"
          className={tab === "collection" ? "tab tab--active" : "tab"}
          onClick={() => {
            setTab("collection");
            void refreshCollection();
          }}
        >
          Collection
        </button>
      </nav>
    </div>
  );
}
