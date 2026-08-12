import { useEffect, useMemo, useState } from "react";
import type {
  CardCondition,
  CardFinish,
  CollectionEntry,
  CollectionSummary,
} from "./types";
import { CARD_CONDITIONS, finishLabel } from "./types";
import {
  filterAndSortCollectionRows,
  type CollectionFinishFilter,
  type CollectionSaleFilter,
  type CollectionSort,
} from "./collectionQuery";
import {
  pickBackupFile,
  parseCollectionBackup,
  shareCollectionBackup,
} from "./collectionBackup";
import {
  prepareExportArtifacts,
  revokeExportArtifacts,
  saveExportImage,
  shareExportArtifacts,
  type ExportArtifacts,
} from "./exportCollection";
import { QuantityPad } from "./QuantityPad";
import {
  finishToPrinting,
  formatUsd,
  loadPriceIndex,
  lookupCardPrice,
  type PriceIndex,
} from "./prices";

interface CollectionViewProps {
  collection: CollectionSummary | null;
  loading?: boolean;
  onRefresh: () => void;
  onStatus?: (message: string | null) => void;
  onError?: (message: string | null) => void;
  onUpdateEntry: (
    id: string,
    patch: {
      quantity: number;
      finish: CardFinish;
      card: CollectionEntry["card"];
      forSale?: boolean;
      condition?: CardCondition;
      askingPrice?: number | null;
    },
  ) => Promise<void>;
  onDeleteEntry: (id: string) => Promise<void>;
  onRestore: (entries: CollectionEntry[]) => Promise<void>;
}

export function CollectionView({
  collection,
  loading,
  onRefresh,
  onStatus,
  onError,
  onUpdateEntry,
  onDeleteEntry,
  onRestore,
}: CollectionViewProps) {
  const [index, setIndex] = useState<PriceIndex | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportArtifacts, setExportArtifacts] = useState<ExportArtifacts | null>(
    null,
  );
  const [editing, setEditing] = useState<CollectionEntry | null>(null);
  const [editQty, setEditQty] = useState("1");
  const [editFinish, setEditFinish] = useState<CardFinish>("normal");
  const [editForSale, setEditForSale] = useState(false);
  const [editCondition, setEditCondition] = useState<CardCondition>("NM");
  const [editAsking, setEditAsking] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [query, setQuery] = useState("");
  const [finishFilter, setFinishFilter] =
    useState<CollectionFinishFilter>("all");
  const [saleFilter, setSaleFilter] = useState<CollectionSaleFilter>("all");
  const [sort, setSort] = useState<CollectionSort>("name");

  useEffect(() => {
    void loadPriceIndex()
      .then(setIndex)
      .catch(() => setIndex(null));
  }, []);

  useEffect(() => {
    return () => revokeExportArtifacts(exportArtifacts);
  }, [exportArtifacts]);

  const priced = useMemo(() => {
    if (!collection) return [];
    return collection.entries.map((entry) => {
      const price = index
        ? lookupCardPrice(index, entry.card, finishToPrinting(entry.finish))
        : null;
      const market = price?.market ?? null;
      const unit = entry.askingPrice ?? market;
      const line = unit != null ? unit * entry.quantity : null;
      return { entry, unit, line, url: price?.url ?? null, market };
    });
  }, [collection, index]);

  const visible = useMemo(
    () =>
      filterAndSortCollectionRows(priced, {
        query,
        finish: finishFilter,
        sale: saleFilter,
        sort,
      }),
    [priced, query, finishFilter, saleFilter, sort],
  );

  const totalValue = priced.reduce((sum, row) => sum + (row.line ?? 0), 0);
  const pricedCount = priced.filter((r) => r.line != null).length;
  const visibleCards = visible.reduce((sum, row) => sum + row.entry.quantity, 0);
  const visibleValue = visible.reduce((sum, row) => sum + (row.line ?? 0), 0);
  const filtered =
    query.trim() !== "" ||
    finishFilter !== "all" ||
    saleFilter !== "all" ||
    sort !== "name";

  function openEditor(entry: CollectionEntry) {
    setEditing(entry);
    setEditQty(String(entry.quantity));
    setEditFinish(entry.finish);
    setEditForSale(entry.forSale);
    setEditCondition(entry.condition);
    setEditAsking(entry.askingPrice != null ? String(entry.askingPrice) : "");
    onError?.(null);
  }

  function closeEditor() {
    setEditing(null);
    setSavingEdit(false);
  }

  async function handleSaveEdit() {
    if (!editing) return;
    const qty = Number(editQty);
    if (!Number.isInteger(qty) || qty < 1) {
      onError?.("Enter a quantity from 1–999");
      return;
    }
    const asking =
      editAsking.trim() === "" ? null : Number(editAsking);
    if (asking != null && (!Number.isFinite(asking) || asking < 0)) {
      onError?.("Asking price must be a valid number");
      return;
    }
    setSavingEdit(true);
    onError?.(null);
    try {
      await onUpdateEntry(editing.id, {
        quantity: qty,
        finish: editFinish,
        card: editing.card,
        forSale: editForSale,
        condition: editCondition,
        askingPrice: asking,
      });
      onStatus?.(
        `Updated ${editing.card.name} · ${finishLabel(editFinish)} ×${qty}`,
      );
      closeEditor();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Could not update card");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDeleteEdit() {
    if (!editing) return;
    setSavingEdit(true);
    onError?.(null);
    try {
      await onDeleteEntry(editing.id);
      onStatus?.(`Removed ${editing.card.name} (${finishLabel(editing.finish)})`);
      closeEditor();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Could not delete card");
    } finally {
      setSavingEdit(false);
    }
  }

  function closeExportPreview() {
    revokeExportArtifacts(exportArtifacts);
    setExportArtifacts(null);
  }

  async function handleExport() {
    if (!collection || visible.length === 0 || exporting) return;
    setExporting(true);
    onStatus?.(null);
    onError?.(null);
    try {
      const artifacts = await prepareExportArtifacts(visible, {
        cards: visibleCards,
        unique: visible.length,
        market: visibleValue,
        priced: visible.filter((r) => r.line != null).length,
      });
      revokeExportArtifacts(exportArtifacts);
      setExportArtifacts(artifacts);
      onStatus?.(
        filtered
          ? `Export ready for ${visible.length} filtered lines`
          : "Export ready — preview below, then Share or Save image",
      );
    } catch (err) {
      onError?.(
        err instanceof Error ? err.message : "Could not export collection",
      );
    } finally {
      setExporting(false);
    }
  }

  async function handleShareExport() {
    if (!exportArtifacts) return;
    setExporting(true);
    onError?.(null);
    try {
      const result = await shareExportArtifacts(exportArtifacts);
      if (result.mode === "shared") {
        onStatus?.(
          `Shared · files also saved under ${result.pathHint} if supported`,
        );
      } else {
        onStatus?.(`Saved · check ${result.pathHint}`);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        onStatus?.(null);
        return;
      }
      onError?.(err instanceof Error ? err.message : "Could not share export");
    } finally {
      setExporting(false);
    }
  }

  async function handleSaveImage() {
    if (!exportArtifacts) return;
    setExporting(true);
    onError?.(null);
    try {
      const path = await saveExportImage(exportArtifacts);
      onStatus?.(`Checklist PNG saved: ${path}`);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Could not save image");
    } finally {
      setExporting(false);
    }
  }

  async function handleBackup() {
    if (!collection) return;
    setExporting(true);
    onError?.(null);
    try {
      const path = await shareCollectionBackup(collection);
      onStatus?.(`Backup ready · ${path}`);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        onStatus?.(null);
        return;
      }
      onError?.(err instanceof Error ? err.message : "Could not backup");
    } finally {
      setExporting(false);
    }
  }

  async function handleRestore() {
    onError?.(null);
    try {
      const text = await pickBackupFile();
      const entries = parseCollectionBackup(text);
      const ok = window.confirm(
        `Restore ${entries.length} lines from backup? This replaces your current collection.`,
      );
      if (!ok) return;
      await onRestore(entries);
      onStatus?.(`Restored ${entries.length} collection lines from backup`);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      onError?.(err instanceof Error ? err.message : "Could not restore backup");
    }
  }

  if (loading && !collection) {
    return <p className="muted">Loading collection…</p>;
  }

  if (!collection || collection.entries.length === 0) {
    return (
      <div className="empty">
        <h2>No cards yet</h2>
        <p>Scan your first Grand Archive card to start the collection.</p>
        <div className="empty__actions">
          <button type="button" className="btn btn--ghost" onClick={onRefresh}>
            Refresh
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => void handleRestore()}
          >
            Restore backup
          </button>
        </div>
      </div>
    );
  }

  return (
    <section className="collection-view">
      <header className="collection-view__header">
        <div>
          <h2>Collection</h2>
          <p className="muted">
            {collection.totalCards} cards · {collection.uniqueCards} unique
            {index
              ? ` · ~${formatUsd(totalValue)} (${pricedCount}/${collection.uniqueCards} priced)`
              : ""}
          </p>
          {filtered && (
            <p className="muted collection-view__filter-meta">
              Showing {visibleCards} cards · {visible.length} lines
              {index ? ` · ~${formatUsd(visibleValue)}` : ""}
            </p>
          )}
        </div>
        <div className="collection-view__actions">
          <button
            type="button"
            className="btn btn--primary btn--compact"
            onClick={() => void handleExport()}
            disabled={exporting || visible.length === 0}
          >
            {exporting ? "Preparing…" : filtered ? "Export view" : "Export"}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--compact"
            onClick={() => void handleBackup()}
            disabled={exporting}
          >
            Backup
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--compact"
            onClick={() => void handleRestore()}
          >
            Restore
          </button>
        </div>
      </header>

      <div className="collection-toolbar">
        <label className="collection-toolbar__search" htmlFor="collection-query">
          <span className="sr-only">Search collection</span>
          <input
            id="collection-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, set, or #"
            autoComplete="off"
            enterKeyHint="search"
          />
        </label>
        <div className="collection-toolbar__row collection-toolbar__row--3">
          <label className="collection-toolbar__field">
            <span>Finish</span>
            <select
              value={finishFilter}
              onChange={(e) =>
                setFinishFilter(e.target.value as CollectionFinishFilter)
              }
            >
              <option value="all">All</option>
              <option value="normal">Normal</option>
              <option value="foil">Foil</option>
            </select>
          </label>
          <label className="collection-toolbar__field">
            <span>Sale</span>
            <select
              value={saleFilter}
              onChange={(e) =>
                setSaleFilter(e.target.value as CollectionSaleFilter)
              }
            >
              <option value="all">All</option>
              <option value="for-sale">For sale</option>
              <option value="keep">Keep</option>
            </select>
          </label>
          <label className="collection-toolbar__field">
            <span>Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as CollectionSort)}
            >
              <option value="name">Name</option>
              <option value="set">Set</option>
              <option value="price-desc">Price high → low</option>
              <option value="price-asc">Price low → high</option>
              <option value="qty-desc">Qty high → low</option>
            </select>
          </label>
        </div>
      </div>

      <p className="collection-view__export-hint muted">
        Tap a card to edit qty, foil, condition, asking price, or for-sale.
        Export/Backup use the current view / full binder.
      </p>

      {exportArtifacts && (
        <div className="export-preview" role="dialog" aria-label="Export preview">
          <div className="export-preview__head">
            <h3>Export preview</h3>
            <button
              type="button"
              className="btn btn--ghost btn--compact"
              onClick={closeExportPreview}
            >
              Close
            </button>
          </div>
          {exportArtifacts.imagePreviewUrl ? (
            <img
              className="export-preview__image"
              src={exportArtifacts.imagePreviewUrl}
              alt="Collection checklist export"
            />
          ) : (
            <p className="muted">Checklist image could not be rendered.</p>
          )}
          <div className="export-preview__actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={exporting}
              onClick={() => void handleShareExport()}
            >
              Share
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={exporting || !exportArtifacts.imageBlob}
              onClick={() => void handleSaveImage()}
            >
              Save image
            </button>
          </div>
        </div>
      )}

      {editing && (
        <div className="entry-editor" role="dialog" aria-label="Edit collection card">
          <div className="entry-editor__head">
            <img
              src={editing.card.imageUrl}
              alt=""
              className="entry-editor__thumb"
            />
            <div>
              <h3>{editing.card.name}</h3>
              <p className="muted">
                {editing.card.setPrefix} #{editing.card.collectorNumber}
              </p>
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--compact"
              onClick={closeEditor}
              disabled={savingEdit}
            >
              Cancel
            </button>
          </div>

          <div className="finish-toggle" role="group" aria-label="Card finish">
            {(["normal", "foil"] as CardFinish[]).map((option) => (
              <button
                key={option}
                type="button"
                className={
                  editFinish === option
                    ? "finish-toggle__btn finish-toggle__btn--active"
                    : "finish-toggle__btn"
                }
                onClick={() => setEditFinish(option)}
                disabled={savingEdit}
              >
                {finishLabel(option)}
              </button>
            ))}
          </div>

          <label className="entry-editor__check">
            <input
              type="checkbox"
              checked={editForSale}
              onChange={(e) => setEditForSale(e.target.checked)}
              disabled={savingEdit}
            />
            For sale
          </label>

          <div className="entry-editor__meta">
            <label className="collection-toolbar__field">
              <span>Condition</span>
              <select
                value={editCondition}
                onChange={(e) =>
                  setEditCondition(e.target.value as CardCondition)
                }
                disabled={savingEdit}
              >
                {CARD_CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="collection-toolbar__field">
              <span>Asking $</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="Market"
                value={editAsking}
                onChange={(e) => setEditAsking(e.target.value)}
                disabled={savingEdit}
              />
            </label>
          </div>

          <QuantityPad
            value={editQty}
            onChange={setEditQty}
            onSaveNext={() => void handleSaveEdit()}
            saving={savingEdit}
            saveLabel="Save"
          />

          <button
            type="button"
            className="btn btn--danger"
            disabled={savingEdit}
            onClick={() => void handleDeleteEdit()}
          >
            Delete from collection
          </button>
        </div>
      )}

      <ul className="collection-list">
        {visible.map(({ entry, unit, line, url, market }) => (
          <li key={entry.id} className="collection-row">
            <button
              type="button"
              className="collection-row__main"
              onClick={() => openEditor(entry)}
              aria-label={`Edit ${entry.card.name}`}
            >
              <img
                src={entry.card.imageUrl}
                alt=""
                className="collection-row__thumb"
                loading="lazy"
              />
              <div className="collection-row__body">
                <span className="collection-row__name">
                  {entry.card.name}
                  <span
                    className={
                      entry.finish === "foil"
                        ? "finish-pill finish-pill--foil"
                        : "finish-pill"
                    }
                  >
                    {finishLabel(entry.finish)}
                  </span>
                  {entry.forSale && (
                    <span className="finish-pill finish-pill--sale">Sale</span>
                  )}
                  <span className="finish-pill">{entry.condition}</span>
                </span>
                <span className="collection-row__set">
                  {entry.card.setPrefix} #{entry.card.collectorNumber}
                  {unit != null
                    ? ` · ${formatUsd(unit)}${
                        entry.askingPrice != null && market != null
                          ? ` ask (mkt ${formatUsd(market)})`
                          : ""
                      }`
                    : ""}
                </span>
              </div>
              <div className="collection-row__right">
                <span className="collection-row__qty" aria-label="Quantity">
                  ×{entry.quantity}
                </span>
                {line != null && (
                  <span className="collection-row__line">{formatUsd(line)}</span>
                )}
              </div>
            </button>
            {url && (
              <a
                className="collection-row__link"
                href={url}
                target="_blank"
                rel="noreferrer"
                aria-label={`TCGPlayer page for ${entry.card.name}`}
                onClick={(e) => e.stopPropagation()}
              >
                $
              </a>
            )}
          </li>
        ))}
      </ul>

      {visible.length === 0 && (
        <p className="muted collection-view__empty-filter">
          No cards match this search/filter.
        </p>
      )}
    </section>
  );
}
