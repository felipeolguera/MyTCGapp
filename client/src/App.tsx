import { useCallback, useEffect, useState } from "react";
import {
  addToCollection,
  fetchCollection,
  searchCards,
  searchCardsBySetCode,
} from "./api";
import { CameraCapture } from "./CameraCapture";
import { CardDetail } from "./CardDetail";
import { CollectionView } from "./CollectionView";
import {
  isWeakNameQuery,
  rankAndFilterMatches,
  type RankedCard,
} from "./match";
import { scanCardImage } from "./ocr";
import type {
  CollectionSummary,
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
  const [selected, setSelected] = useState<GaCardEdition | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [ocrHint, setOcrHint] = useState<string | null>(null);
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

  function resetScan(keepStatus = false) {
    setPhase("ready");
    setSelected(null);
    setResults([]);
    setQuantity("1");
    setBusy(false);
    setSaving(false);
    setOcrHint(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (!keepStatus) setStatus(null);
  }

  function applyRanked(ranked: RankedCard[], label: string) {
    const cards = ranked.map((r) => r.card);
    setResults(cards);
    if (cards.length === 0) {
      setPhase("results");
      setStatus(`${label}: no close matches — edit the name and search`);
      return;
    }

    const best = ranked[0];
    // Auto-open only when we're very confident.
    if (cards.length === 1 && best.score >= 0.72) {
      setSelected(cards[0]);
      setPhase("detail");
      setQuantity("1");
      setStatus(`Matched “${cards[0].name}”`);
      return;
    }

    setPhase("results");
    setStatus(
      `${cards.length} close match${cards.length === 1 ? "" : "es"} for “${best.query}”`,
    );
  }

  async function runSearch(name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a card name to search.");
      return;
    }
    if (isWeakNameQuery(trimmed)) {
      setError("Try a more specific card name (at least a few letters).");
      return;
    }

    setBusy(true);
    setError(null);
    setStatus(`Looking up “${trimmed}”…`);
    try {
      const cards = await searchCards(trimmed);
      const ranked = rankAndFilterMatches(trimmed, cards, {
        minScore: 0.35,
        limit: 8,
      });
      setQuery(trimmed);
      applyRanked(ranked, "Search");
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
    setOcrHint(null);
    setStatus("Reading title & set code…");

    try {
      const scanned = await scanCardImage(blob);
      const hintParts = [
        scanned.nameCandidates[0]
          ? `title≈${scanned.nameCandidates[0]}`
          : null,
        scanned.setCodes[0]
          ? `code≈${scanned.setCodes[0].prefix} #${scanned.setCodes[0].collectorNumber}`
          : null,
      ].filter(Boolean);
      setOcrHint(hintParts.join(" · ") || "OCR unclear");

      // 1) Prefer exact set prefix + collector number when OCR finds it.
      for (const code of scanned.setCodes) {
        setStatus(
          `Looking up ${code.prefix} #${code.collectorNumber}…`,
        );
        const byCode = await searchCardsBySetCode(
          code.prefix,
          code.collectorNumber,
        );
        if (byCode.length > 0) {
          setQuery(byCode[0].name);
          const ranked = byCode.map((card) => ({
            card,
            score: 1,
            query: `${code.prefix} ${code.collectorNumber}`,
          }));
          applyRanked(ranked, "Set code");
          return;
        }
      }

      // 2) Name candidates from the title band only, ranked by similarity.
      const strong = scanned.nameCandidates.filter((c) => !isWeakNameQuery(c));
      if (strong.length === 0) {
        setStatus("Couldn’t read a clear title — type the name below.");
        setPhase("ready");
        return;
      }

      setQuery(strong[0]);
      let bestRanked: RankedCard[] = [];
      let bestQuery = strong[0];

      for (const candidate of strong) {
        setStatus(`Looking up “${candidate}”…`);
        const cards = await searchCards(candidate);
        const ranked = rankAndFilterMatches(candidate, cards, {
          minScore: 0.45,
          limit: 8,
        });
        if (
          ranked.length > 0 &&
          (bestRanked.length === 0 || ranked[0].score > bestRanked[0].score)
        ) {
          bestRanked = ranked;
          bestQuery = candidate;
        }
        // Early exit on near-exact match.
        if (ranked[0]?.score >= 0.9) break;
      }

      setQuery(bestQuery);
      if (bestRanked.length === 0) {
        setResults([]);
        setPhase("results");
        setStatus(
          `Read “${bestQuery}” but no close database match — edit and search`,
        );
        return;
      }
      applyRanked(bestRanked, "OCR");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Recognition failed — try manual search.",
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
      const { collection: next } = await addToCollection(selected, qty);
      setCollection(next);
      setSessionAdds((n) => n + qty);
      setStatus(`Added ×${qty} ${selected.name}`);
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
      {ocrHint && phase !== "detail" && (
        <p className="ocr-hint">OCR: {ocrHint}</p>
      )}

      <main className="main">
        {tab === "scan" && (
          <>
            {phase === "detail" && selected ? (
              <CardDetail
                card={selected}
                quantity={quantity}
                onQuantityChange={setQuantity}
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
                  disabled={busy}
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
                    Search / fix the card name
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
                  <p className="muted pulse">Recognizing card…</p>
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
                              setPhase("detail");
                              setStatus(null);
                            }}
                          >
                            <img src={card.imageUrl} alt="" loading="lazy" />
                            <span>
                              <strong>{card.name}</strong>
                              <small>
                                {card.setPrefix} #{card.collectorNumber}
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
                          setStatus(
                            "None matched — edit the name above and search again",
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
