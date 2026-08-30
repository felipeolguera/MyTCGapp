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
import { MatchChoicePopup } from "./MatchChoicePopup";
import {
  PageConfirmGrid,
  type PageConfirmSaveMeta,
} from "./PageConfirmGrid";
import { CollectionView } from "./CollectionView";
import { DeckBuilderView } from "./DeckBuilderView";
import { SearchAutocomplete } from "./SearchAutocomplete";
import {
  suggestionsFromCards,
  type SearchSuggestion,
} from "./searchSuggest";
import { loadCardIndex, matchCardVisually } from "./visualMatch";
import { warmNameOcr } from "./nameOcr";
import {
  matchPagePhoto,
  pageGridDims,
  pageScanStatus,
  revokePageCellPreviews,
  type PageGridPreset,
  type PageScanCell,
} from "./pageScan";
import type {
  CardCondition,
  CollectionEntry,
  CollectionSummary,
  CardFinish,
  GaCardEdition,
  ScanPhase,
  TabId,
} from "./types";
import {
  collectionEntryId,
  finishLabel,
  normalizeBinderLabel,
  normalizeBinderPage,
  normalizeBinderSlot,
} from "./types";
import { APP_VERSION } from "./version";
import { exportCardCode } from "./exportCollection";
import { recordSale } from "./salesLedger";
import { readGeoDefaults, rememberGeoAfterSave } from "./binderGeoDefaults";

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
  const [scanLayout, setScanLayout] = useState<"card" | "page">("card");
  const [pagePreset, setPagePreset] = useState<PageGridPreset>("3x3");
  const [pageCells, setPageCells] = useState<PageScanCell[]>([]);
  const [addFlash, setAddFlash] = useState<{
    name: string;
    kind: "added" | "audit";
  } | null>(null);
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
        warmNameOcr();
      })
      .catch(() => {
        setIndexReady(false);
        setStatus("Visual index unavailable — use name search");
      });
  }, []);

  // Status toasts auto-clear after 2s (errors stay until dismissed).
  useEffect(() => {
    if (!status || error) return;
    const handle = window.setTimeout(() => setStatus(null), 2000);
    return () => window.clearTimeout(handle);
  }, [status, error]);

  // Centered “[Name] Added” flash after a quick pick.
  useEffect(() => {
    if (!addFlash) return;
    const handle = window.setTimeout(() => setAddFlash(null), 1600);
    return () => window.clearTimeout(handle);
  }, [addFlash]);

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

  function clearPageCells() {
    revokePageCellPreviews(pageCells);
    setPageCells([]);
  }

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
    clearPageCells();
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
    setSelected(null);

    if (cards.length === 0) {
      setPhase("ready");
      setStatus("No visual match — try a flatter photo or search by name");
      return;
    }

    setQuery(cards[0].name);
    setPhase("results");
    setStatus(
      `Top ${cards.length} match${cards.length === 1 ? "" : "es"} — tap to add`,
    );
  }

  async function handleQuickPick(card: GaCardEdition, finishPick: CardFinish = "normal") {
    setSaving(true);
    setError(null);
    try {
      if (scanIntent === "audit") {
        const entryId = collectionEntryId(card.editionId, finishPick);
        const existing = collection?.entries.find((e) => e.id === entryId);
        if (!existing) {
          throw new Error("Not in binder — switch finish or Add mode");
        }
        const nextQty = existing.quantity - 1;
        recordSale(
          [
            {
              entryId: existing.id,
              name: existing.card.name,
              finish: existing.finish,
              condition: existing.condition,
              setCode: exportCardCode(existing),
              quantity: 1,
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
        setAddFlash({ name: card.name, kind: "audit" });
        setStatus(
          `Audit −1 ${card.name} (${finishLabel(finishPick)})${
            nextQty < 1 ? " · removed" : ` · left ×${nextQty}`
          }`,
        );
      } else {
        const geo = readGeoDefaults();
        const binder = normalizeBinderLabel(geo.binder);
        const page = normalizeBinderPage(geo.page);
        const slot = normalizeBinderSlot(geo.slot);
        const { entry, collection: next, previousQuantity } =
          await addToCollection(card, 1, finishPick, {
            binder,
            page,
            slot,
          });
        rememberGeoAfterSave({
          binder: geo.binder,
          page: geo.page,
          slot: geo.slot,
          advanceSlot: geo.advanceSlot,
        });
        setCollection(next);
        setSessionAdds((n) => n + 1);
        setLastAdd({
          entryId: entry.id,
          card,
          finish: finishPick,
          addedQty: 1,
          previousQuantity,
        });
        setAddFlash({ name: card.name, kind: "added" });
        setStatus(
          `Added ×1 ${card.name} (${finishLabel(finishPick)}) · ready for next snap`,
        );
      }
      setResults([]);
      setMatchScores({});
      setSelected(null);
      setCaptureWarnings([]);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setPhase("ready");
      setBusy(false);
      setSaving(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setSaving(false);
    }
  }

  function pickNameSuggestion(item: SearchSuggestion) {
    const card = suggestCards.find((c) => c.editionId === item.id);
    setQuery(item.primary);
    setNameSuggestions([]);
    if (card) {
      void handleQuickPick(card);
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
          ? `${unique.length} card${unique.length === 1 ? "" : "s"} found — tap to add`
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
    clearPageCells();
    setPhase("recognizing");
    setBusy(true);
    setError(null);

    if (scanLayout === "page") {
      const { rows, cols } = pageGridDims(pagePreset);
      setStatus(
        payload.quality.warnings.length
          ? `${payload.quality.warnings[0]} · matching page…`
          : `Matching ${rows * cols} pockets…`,
      );
      try {
        const cells = await matchPagePhoto(payload.blob, {
          rows,
          cols,
          onProgress: (done, total) => {
            setStatus(`Matching pockets… ${done}/${total}`);
          },
        });
        setPageCells(cells);
        setPhase("page");
        setStatus(pageScanStatus(cells));
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Page match failed — try a flatter photo.",
        );
        setPhase("ready");
      } finally {
        setBusy(false);
      }
      return;
    }

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

  async function handleSavePage(meta: PageConfirmSaveMeta) {
    if (meta.cells.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      let saved = 0;
      let collectionNext = collection;
      for (const cell of meta.cells) {
        if (scanIntent === "audit") {
          const entryId = collectionEntryId(cell.card.editionId, cell.finish);
          const existing = collectionNext?.entries.find((e) => e.id === entryId);
          if (!existing) continue;
          const nextQty = existing.quantity - 1;
          recordSale(
            [
              {
                entryId: existing.id,
                name: existing.card.name,
                finish: existing.finish,
                condition: existing.condition,
                setCode: exportCardCode(existing),
                quantity: 1,
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
          if (nextQty < 1) {
            const removed = await removeFromCollection(existing.id);
            collectionNext = removed.collection;
          } else {
            const updated = await updateCollectionEntry(existing.id, {
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
            collectionNext = updated.collection;
          }
          saved += 1;
        } else {
          const { collection: next } = await addToCollection(
            cell.card,
            1,
            cell.finish,
            {
              binder: meta.binder,
              page: meta.page,
              slot: cell.slot,
            },
          );
          collectionNext = next;
          saved += 1;
          setSessionAdds((n) => n + 1);
        }
      }
      if (collectionNext) setCollection(collectionNext);
      setLastAdd(null);
      setStatus(
        scanIntent === "audit"
          ? `Audit −${saved} from page${batchMode ? " · ready for next page" : ""}`
          : `Added ${saved} from page${
              meta.page != null ? ` p${meta.page}` : ""
            }${batchMode ? " · ready for next page" : ""}`,
      );
      if (batchMode) {
        clearPageCells();
        setSelected(null);
        setResults([]);
        setMatchScores({});
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
      setError(err instanceof Error ? err.message : "Could not save page");
      setSaving(false);
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

  const pageDims = pageGridDims(pagePreset);
  const confirming = phase === "page";
  const showCardChoices =
    scanLayout === "card" &&
    phase === "results" &&
    results.length > 0 &&
    !selected;
  const cameraOverlay =
    addFlash ? (
      <div
        className="camera__match-overlay camera__flash"
        role="status"
        aria-live="polite"
      >
        <div
          className={
            addFlash.kind === "audit"
              ? "camera__flash-card camera__flash-card--audit"
              : "camera__flash-card"
          }
          key={`${addFlash.kind}:${addFlash.name}`}
        >
          <span className="camera__flash-name">{addFlash.name}</span>
          <span className="camera__flash-verb">
            {addFlash.kind === "audit" ? "Removed" : "Added"}
          </span>
        </div>
      </div>
    ) : scanLayout === "card" && phase === "recognizing" ? (
      <div className="camera__match-overlay camera__match-overlay--busy">
        Matching…
      </div>
    ) : showCardChoices ? (
      <MatchChoicePopup
        cards={results}
        scores={matchScores}
        busy={saving}
        onPick={(card) => void handleQuickPick(card)}
        onDismiss={() => {
          setResults([]);
          setMatchScores({});
          setCaptureWarnings([]);
          setPhase("ready");
          setStatus(null);
          if (previewUrl) URL.revokeObjectURL(previewUrl);
          setPreviewUrl(null);
        }}
      />
    ) : null;

  return (
    <div
      className={
        tab === "collection" || tab === "decks" ? "app app--collection" : "app"
      }
    >
      {(tab === "collection" || tab === "decks") && (
        <header className="topbar topbar--compact">
          <div className="topbar__brand">
            <img
              className="topbar__logo"
              src="/icons/brand-mark.png"
              alt=""
              width={40}
              height={40}
            />
            <h1 className="topbar__title-inline">Archive Binder</h1>
          </div>
          <div className="topbar__stats">
            <span className="topbar__version" title="App version">
              v{APP_VERSION}
            </span>
            <span>{collection?.totalCards ?? 0} owned</span>
          </div>
        </header>
      )}

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
              <>
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
                <div className="scan__intent" role="group" aria-label="Capture layout">
                  <button
                    type="button"
                    className={
                      scanLayout === "card"
                        ? "scan__intent-btn scan__intent-btn--active"
                        : "scan__intent-btn"
                    }
                    onClick={() => setScanLayout("card")}
                  >
                    Card
                  </button>
                  <button
                    type="button"
                    className={
                      scanLayout === "page"
                        ? "scan__intent-btn scan__intent-btn--active"
                        : "scan__intent-btn"
                    }
                    onClick={() => setScanLayout("page")}
                    title="Snap a full binder page"
                  >
                    Page
                  </button>
                </div>
                {scanLayout === "page" && (
                  <label className="scan__grid-preset">
                    <span className="sr-only">Page grid</span>
                    <select
                      value={pagePreset}
                      onChange={(e) =>
                        setPagePreset(e.target.value as PageGridPreset)
                      }
                      aria-label="Page grid size"
                    >
                      <option value="3x3">3×3</option>
                      <option value="4x3">4×3</option>
                    </select>
                  </label>
                )}
              </div>
              <p className="scan__session muted">
                v{APP_VERSION} · {sessionAdds} this session · {collection?.totalCards ?? 0} owned
              </p>
              </>
            )}

            <CameraCapture
              onCapture={(payload) => void handleCapture(payload)}
              disabled={busy || !indexReady || confirming || Boolean(cameraOverlay)}
              keepAwake={tab === "scan"}
              collapsed={confirming}
              captureMode={scanLayout}
              pageRows={pageDims.rows}
              pageCols={pageDims.cols}
              overlay={cameraOverlay}
            />

            {captureWarnings.length > 0 && !cameraOverlay && (
              <div className="banner banner--warn" role="status">
                {captureWarnings[0]}
                {captureWarnings.length > 1
                  ? ` · ${captureWarnings[1]}`
                  : ""}
              </div>
            )}

            {phase === "page" ? (
              <PageConfirmGrid
                cells={pageCells}
                onChange={setPageCells}
                onSaveAll={(meta) => void handleSavePage(meta)}
                onRetake={() => {
                  clearPageCells();
                  setPhase("ready");
                  setStatus(null);
                }}
                saving={saving}
                scanIntent={scanIntent}
              />
            ) : selected ? (
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
                      disabled={busy || saving}
                      minChars={2}
                      aria-label="Search card name"
                    />
                    <button
                      type="submit"
                      className="btn btn--primary"
                      disabled={busy || saving}
                    >
                      Search
                    </button>
                  </div>
                </form>

                {scanLayout === "page" && phase === "recognizing" && (
                  <p className="muted pulse">Matching page…</p>
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
            onImportedDecklist={(binder) => {
              setTab("collection");
              void refreshCollection();
              setStatus(`Imported into “${binder}”`);
            }}
          />
        )}

        {tab === "decks" && (
          <DeckBuilderView
            onStatus={setStatus}
            onError={setError}
            onSavedToBinder={(binder) => {
              void refreshCollection();
              setTab("collection");
              setStatus(`Deck saved to binder “${binder}”`);
            }}
          />
        )}

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
          <button
            type="button"
            className={tab === "decks" ? "tab tab--active" : "tab"}
            onClick={() => setTab("decks")}
          >
            Decks
          </button>
        </nav>
        </div>
      </main>
    </div>
  );
}
