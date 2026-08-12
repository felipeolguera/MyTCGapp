import { useCallback, useEffect, useState } from "react";
import {
  addToCollection,
  bulkRemoveFromCollection,
  bulkSetForSale,
  fetchCollection,
  removeFromCollection,
  restoreCollection,
  searchCards,
  updateCollectionEntry,
} from "./api";
import { CameraCapture, type CapturePayload } from "./CameraCapture";
import { ScanConfirmSheet, type ScanIntent } from "./ScanConfirmSheet";
import { CollectionView } from "./CollectionView";
import { SearchAutocomplete } from "./SearchAutocomplete";
import {
  suggestionsFromCards,
  type SearchSuggestion,
} from "./searchSuggest";
import { loadCardIndex, matchCardVisually, shouldAutoConfirm } from "./visualMatch";
import type {
  CardCondition,
  CollectionEntry,
  CollectionSummary,
  CardFinish,
  GaCardEdition,
  ScanPhase,
  TabId,
} from "./types";
import { collectionEntryId, finishLabel } from "./types";
import { APP_VERSION } from "./version";
import { exportCardCode } from "./exportCollection";
import { recordSale } from "./salesLedger";

interface LastAdd {
  entryId: string;
  card: GaCardEdition;
  finish: CardFinish;
  addedQty: number;
  previousQuantity: number;
}

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
  const [lastAdd, setLastAdd] = useState<LastAdd | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [captureWarnings, setCaptureWarnings] = useState<string[]>([]);
  const [batchMode, setBatchMode] = useState(true);
  const [scanIntent, setScanIntent] = useState<ScanIntent>("add");
  const [nameSuggestions, setNameSuggestions] = useState<SearchSuggestion[]>(
    [],
  );
  const [suggestCards, setSuggestCards] = useState<GaCardEdition[]>([]);

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

  useEffect(() => {
    if (selected || tab !== "scan") {
      setNameSuggestions([]);
      setSuggestCards([]);
      return;
    }
    const q = query.trim();
    if (q.length < 2) {
      setNameSuggestions([]);
      setSuggestCards([]);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void searchCards(q)
        .then((cards) => {
          if (cancelled) return;
          setSuggestCards(cards);
          setNameSuggestions(suggestionsFromCards(cards, 8));
        })
        .catch(() => {
          if (!cancelled) {
            setSuggestCards([]);
            setNameSuggestions([]);
          }
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, selected, tab]);

  function resetScan(keepStatus = false) {
    setPhase("ready");
    setSelected(null);
    setResults([]);
    setMatchScores({});
    setQuantity("1");
    setFinish("normal");
    setBusy(false);
    setSaving(false);
    setCaptureWarnings([]);
    setNameSuggestions([]);
    setSuggestCards([]);
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
    setQuantity("1");
    setFinish("normal");

    if (cards.length === 0) {
      setSelected(null);
      setPhase("results");
      setStatus("No visual match — try a flatter photo or search by name");
      return;
    }

    setQuery(cards[0].name);
    const best = matches[0];
    if (shouldAutoConfirm(matches)) {
      setSelected(cards[0]);
      setPhase("detail");
      setStatus(
        `Likely “${cards[0].name}” (${Math.round(best.score * 100)}%) — confirm or Wrong`,
      );
      return;
    }

    setSelected(null);
    setPhase("results");
    setStatus(
      `Top ${cards.length} match${cards.length === 1 ? "" : "es"} — confirm “${cards[0].name}” (${Math.round(best.score * 100)}%)`,
    );
  }

  function pickNameSuggestion(item: SearchSuggestion) {
    const card = suggestCards.find((c) => c.editionId === item.id);
    setQuery(item.primary);
    setNameSuggestions([]);
    if (card) {
      setSelected(card);
      setQuantity("1");
      setFinish("normal");
      setPhase("detail");
      setStatus(`Confirm ${card.name}`);
      return;
    }
    void runSearch(item.primary);
  }

  async function runSearch(name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a card name to search.");
      return;
    }
    setBusy(true);
    setError(null);
    setCaptureWarnings([]);
    setStatus(`Looking up “${trimmed}”…`);
    try {
      const cards = await searchCards(trimmed);
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
      setSelected(null);
      setPhase("results");
      setStatus(
        unique.length
          ? `${unique.length} card${unique.length === 1 ? "" : "s"} found — tap to confirm`
          : "No matches — try another name",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleCapture(payload: CapturePayload) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(payload.previewUrl);
    setCaptureWarnings(payload.quality.warnings);
    setSelected(null);
    setPhase("recognizing");
    setBusy(true);
    setError(null);
    setStatus(
      payload.quality.warnings.length
        ? `${payload.quality.warnings[0]} · still matching…`
        : "Comparing card art to Grand Archive…",
    );

    try {
      const matches = await matchCardVisually(payload.blob, {
        limit: 8,
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

  async function handleSaveNext(meta: {
    forSale: boolean;
    condition: CardCondition;
    askingPrice: number | null;
    binder: string;
    page: number | null;
    slot: number | null;
  }) {
    if (!selected) return;
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 1) {
      setError("Enter a quantity from 1–999");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (scanIntent === "audit") {
        const entryId = collectionEntryId(selected.editionId, finish);
        const existing = collection?.entries.find((e) => e.id === entryId);
        if (!existing) {
          throw new Error("Not in binder — switch finish or Add mode");
        }
        const subtract = Math.min(qty, existing.quantity);
        const nextQty = existing.quantity - subtract;
        recordSale(
          [
            {
              entryId: existing.id,
              name: existing.card.name,
              finish: existing.finish,
              condition: existing.condition,
              setCode: exportCardCode(existing),
              quantity: subtract,
              unitPrice: existing.askingPrice,
              card: existing.card,
              forSale: existing.forSale,
              askingPrice: existing.askingPrice,
              note: existing.note,
              binder: existing.binder,
              page: existing.page,
              slot: existing.slot,
            },
          ],
          "sold-one",
        );
        const { collection: next } =
          nextQty < 1
            ? await removeFromCollection(existing.id).then((r) => ({
                collection: r.collection,
              }))
            : await updateCollectionEntry(existing.id, {
                quantity: nextQty,
                finish: existing.finish,
                card: existing.card,
                forSale: existing.forSale,
                condition: existing.condition,
                askingPrice: existing.askingPrice,
                note: existing.note,
                binder: existing.binder,
                page: existing.page,
                slot: existing.slot,
              });
        setCollection(next);
        setLastAdd(null);
        setStatus(
          `Audit −${subtract} ${selected.name} (${finishLabel(finish)})${
            nextQty < 1 ? " · removed" : ` · left ×${nextQty}`
          }${batchMode ? " · ready for next snap" : ""}`,
        );
      } else {
        const { entry, collection: next, previousQuantity } =
          await addToCollection(selected, qty, finish, {
            forSale: meta.forSale,
            condition: meta.condition,
            askingPrice: meta.askingPrice,
            binder: meta.binder,
            page: meta.page,
            slot: meta.slot,
          });
        setCollection(next);
        setSessionAdds((n) => n + qty);
        setLastAdd({
          entryId: entry.id,
          card: selected,
          finish,
          addedQty: qty,
          previousQuantity,
        });
        const loc =
          meta.binder || meta.page != null || meta.slot != null
            ? ` · ${[meta.binder, meta.page != null ? `p${meta.page}` : "", meta.slot != null ? `s${meta.slot}` : ""].filter(Boolean).join(" ")}`
            : "";
        setStatus(
          `Added ×${qty} ${selected.name} (${finishLabel(finish)})${
            meta.forSale ? " · for sale" : ""
          }${loc}${batchMode ? " · ready for next snap" : ""}`,
        );
      }
      if (batchMode) {
        setSelected(null);
        setResults([]);
        setMatchScores({});
        setQuantity("1");
        setFinish("normal");
        setCaptureWarnings([]);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        setPhase("ready");
        setBusy(false);
        setSaving(false);
      } else {
        resetScan(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setSaving(false);
    }
  }

  async function handleUndoLastAdd() {
    if (!lastAdd || undoing) return;
    setUndoing(true);
    setError(null);
    try {
      const { collection: next } = await updateCollectionEntry(lastAdd.entryId, {
        quantity: lastAdd.previousQuantity,
        finish: lastAdd.finish,
        card: lastAdd.card,
      });
      setCollection(next);
      setSessionAdds((n) => Math.max(0, n - lastAdd.addedQty));
      setStatus(
        `Undid ×${lastAdd.addedQty} ${lastAdd.card.name} (${finishLabel(lastAdd.finish)})`,
      );
      setLastAdd(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not undo");
    } finally {
      setUndoing(false);
    }
  }

  async function handleUpdateEntry(
    id: string,
    patch: {
      quantity: number;
      finish: CardFinish;
      card: GaCardEdition;
      forSale?: boolean;
      condition?: CardCondition;
      askingPrice?: number | null;
      note?: string;
    },
  ) {
    const { collection: next } = await updateCollectionEntry(id, patch);
    setCollection(next);
    setLastAdd(null);
  }

  async function handleDeleteEntry(id: string) {
    const { collection: next } = await removeFromCollection(id);
    setCollection(next);
    setLastAdd(null);
  }

  async function handleBulkDelete(ids: string[]) {
    const next = await bulkRemoveFromCollection(ids);
    setCollection(next);
    setLastAdd(null);
  }

  async function handleRestoreCollection(entries: CollectionEntry[]) {
    const next = await restoreCollection(entries);
    setCollection(next);
    setLastAdd(null);
  }

  async function handleBulkSetForSale(ids: string[], forSale: boolean) {
    const next = await bulkSetForSale(ids, forSale);
    setCollection(next);
    setLastAdd(null);
  }

  const confirming = Boolean(selected);

  return (
    <div className={tab === "collection" ? "app app--collection" : "app"}>
      <header className={tab === "collection" ? "topbar topbar--compact" : "topbar"}>
        <div className="topbar__brand">
          <img
            className="topbar__logo"
            src="/icons/brand-mark.png"
            alt=""
            width={40}
            height={40}
          />
          {tab === "collection" ? (
            <h1 className="topbar__title-inline">Archive Binder</h1>
          ) : (
            <div>
              <p className="brand">Archive Binder</p>
              <h1>Grand Archive</h1>
            </div>
          )}
        </div>
        <div className="topbar__stats">
          <span className="topbar__version" title="App version">
            v{APP_VERSION}
          </span>
          <span>{collection?.totalCards ?? 0} owned</span>
          {tab === "scan" && <span>{sessionAdds} this session</span>}
        </div>
      </header>

      {error && (
        <div className="banner banner--error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            className="banner__dismiss"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}
      {status && !error && (
        <div className="banner banner--status">
          <span>{status}</span>
          {lastAdd ? (
            <button
              type="button"
              className="banner__action"
              onClick={() => void handleUndoLastAdd()}
              disabled={undoing}
            >
              {undoing ? "Undoing…" : "Undo"}
            </button>
          ) : (
            <button
              type="button"
              className="banner__dismiss"
              onClick={() => setStatus(null)}
              aria-label="Dismiss status"
            >
              ×
            </button>
          )}
        </div>
      )}

      <main className="main">
        <div className="main__scroll">
        {tab === "scan" && (
          <section className={confirming ? "scan scan--confirming" : "scan"}>
            {!confirming && (
              <div className="scan__batch-bar">
                <label
                  className="scan__batch-toggle"
                  title={
                    batchMode
                      ? "Camera stays ready after Save & Next"
                      : "Returns to idle after each save"
                  }
                >
                  <input
                    type="checkbox"
                    checked={batchMode}
                    onChange={(e) => setBatchMode(e.target.checked)}
                  />
                  Batch
                </label>
                <div className="scan__intent" role="group" aria-label="Scan mode">
                  <button
                    type="button"
                    className={
                      scanIntent === "add"
                        ? "scan__intent-btn scan__intent-btn--active"
                        : "scan__intent-btn"
                    }
                    onClick={() => setScanIntent("add")}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    className={
                      scanIntent === "audit"
                        ? "scan__intent-btn scan__intent-btn--active"
                        : "scan__intent-btn"
                    }
                    onClick={() => setScanIntent("audit")}
                    title="Subtract from binder on confirm"
                  >
                    Audit
                  </button>
                </div>
              </div>
            )}

            <CameraCapture
              onCapture={(payload) => void handleCapture(payload)}
              disabled={busy || !indexReady || confirming}
              keepAwake={tab === "scan"}
              collapsed={confirming}
            />

            {captureWarnings.length > 0 && (
              <div className="banner banner--warn" role="status">
                {captureWarnings[0]}
                {captureWarnings.length > 1
                  ? ` · ${captureWarnings[1]}`
                  : ""}
              </div>
            )}

            {previewUrl && !selected && (
              <img
                src={previewUrl}
                alt="Last capture"
                className="scan__preview"
              />
            )}

            {selected ? (
              <ScanConfirmSheet
                card={selected}
                quantity={quantity}
                finish={finish}
                matchScore={matchScores[selected.editionId]}
                ownedQuantity={
                  collection?.entries.find(
                    (e) =>
                      e.id === collectionEntryId(selected.editionId, finish),
                  )?.quantity ?? 0
                }
                scanIntent={scanIntent}
                onQuantityChange={setQuantity}
                onFinishChange={setFinish}
                onSaveNext={(meta) => void handleSaveNext(meta)}
                onWrongCard={() => {
                  setSelected(null);
                  setPhase(results.length ? "results" : "ready");
                  setStatus(
                    results.length
                      ? "Pick another match or retake"
                      : null,
                  );
                }}
                saving={saving}
              />
            ) : (
              <>
                <form
                  className="search"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void runSearch(query);
                  }}
                >
                  <label className="search__label" htmlFor="card-query">
                    Or search by card name
                  </label>
                  <div className="search__row">
                    <SearchAutocomplete
                      id="card-query"
                      value={query}
                      onChange={setQuery}
                      suggestions={nameSuggestions}
                      onPick={pickNameSuggestion}
                      placeholder="e.g. Spirit of Slime"
                      disabled={busy}
                      minChars={2}
                      aria-label="Search card name"
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
                      {results.map((card, idx) => (
                        <li key={card.editionId}>
                          <button
                            type="button"
                            className={
                              idx === 0 ? "result result--best" : "result"
                            }
                            onClick={() => {
                              setSelected(card);
                              setQuantity("1");
                              setFinish("normal");
                              setPhase("detail");
                              setStatus(`Confirm ${card.name}`);
                            }}
                          >
                            <img src={card.imageUrl} alt="" loading="lazy" />
                            <span>
                              <strong>
                                {idx === 0 ? "Best · " : ""}
                                {card.name}
                              </strong>
                              <small>
                                {card.setPrefix} #{card.collectorNumber}
                                {card.setName ? ` · ${card.setName}` : ""}
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
                          setCaptureWarnings([]);
                          setPhase("ready");
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
              </>
            )}
          </section>
        )}

        {tab === "collection" && (
          <CollectionView
            collection={collection}
            loading={collectionLoading}
            onRefresh={() => void refreshCollection()}
            onStatus={setStatus}
            onError={setError}
            onUpdateEntry={handleUpdateEntry}
            onDeleteEntry={handleDeleteEntry}
            onBulkDelete={handleBulkDelete}
            onRestore={handleRestoreCollection}
            onBulkSetForSale={handleBulkSetForSale}
          />
        )}
        </div>
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
