import { useCallback, useEffect, useState } from "react";
import { addToCollection, fetchCollection, searchCards } from "./api";
import { CameraCapture } from "./CameraCapture";
import { CardDetail } from "./CardDetail";
import { CollectionView } from "./CollectionView";
import { extractCardNameCandidates } from "./ocr";
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
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (!keepStatus) setStatus(null);
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
      setResults(cards);
      setPhase("results");
      setStatus(
        cards.length
          ? `${cards.length} edition${cards.length === 1 ? "" : "s"} found`
          : "No matches — try a shorter name",
      );
      if (cards.length === 1) {
        setSelected(cards[0]);
        setPhase("detail");
        setQuantity("1");
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
    setStatus("Reading card text…");

    try {
      const candidates = await extractCardNameCandidates(blob);
      if (candidates.length === 0) {
        setStatus("Couldn’t read the name — search manually.");
        setPhase("ready");
        return;
      }

      setQuery(candidates[0]);
      // Try candidates in order until we get hits.
      for (const candidate of candidates) {
        setStatus(`Looking up “${candidate}”…`);
        const cards = await searchCards(candidate);
        if (cards.length > 0) {
          setResults(cards);
          setQuery(candidate);
          setPhase(cards.length === 1 ? "detail" : "results");
          if (cards.length === 1) {
            setSelected(cards[0]);
            setQuantity("1");
          }
          setStatus(
            cards.length === 1
              ? "Match found — set quantity"
              : `${cards.length} possible matches`,
          );
          return;
        }
      }
      setPhase("results");
      setResults([]);
      setStatus("No database match — refine the name and search.");
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
                    Or search by name
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
