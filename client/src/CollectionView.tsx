import { useEffect, useMemo, useState } from "react";
import type { CardFinish, CollectionEntry, CollectionSummary } from "./types";
import { finishLabel } from "./types";
import {
  filterAndSortCollectionRows,
  type CollectionFinishFilter,
  type CollectionSort,
} from "./collectionQuery";
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
    quantity: number,
    finish: CardFinish,
    card: CollectionEntry["card"],
  ) => Promise<void>;
  onDeleteEntry: (id: string) => Promise<void>;
}

export function CollectionView({
  collection,
  loading,
  onRefresh,
  onStatus,
  onError,
  onUpdateEntry,
  onDeleteEntry,
}: CollectionViewProps) {
  const [index, setIndex] = useState<PriceIndex | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportArtifacts, setExportArtifacts] = useState<ExportArtifacts | null>(
    null,
  );
  const [editing, setEditing] = useState<CollectionEntry | null>(null);
  const [editQty, setEditQty] = useState("1");
  const [editFinish, setEditFinish] = useState<CardFinish>("normal");
  const [savingEdit, setSavingEdit] = useState(false);
  const [query, setQuery] = useState("");
  const [finishFilter, setFinishFilter] =
    useState<CollectionFinishFilter>("all");
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
      const unit = price?.market ?? null;
      const line = unit != null ? unit * entry.quantity : null;
      return { entry, unit, line, url: price?.url ?? null };
    });
  }, [collection, index]);

  const visible = useMemo(
    () =>
      filterAndSortCollectionRows(priced, {
        query,
        finish: finishFilter,
        sort,
      }),
    [priced, query, finishFilter, sort],
  );

  const totalValue = priced.reduce((sum, row) => sum + (row.line ?? 0), 0);
  const pricedCount = priced.filter((r) => r.line != null).length;
  const visibleCards = visible.reduce((sum, row) => sum + row.entry.quantity, 0);
  const visibleValue = visible.reduce((sum, row) => sum + (row.line ?? 0), 0);
  const filtered =
    query.trim() !== "" || finishFilter !== "all" || sort !== "name";

  function openEditor(entry: CollectionEntry) {
    setEditing(entry);
    setEditQty(String(entry.quantity));
    setEditFinish(entry.finish);
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
    setSavingEdit(true);
    onError?.(null);
    try {
      await onUpdateEntry(editing.id, qty, editFinish, editing.card);
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

  if (loading && !collection) {
    return <p className="muted">Loading collection…</p>;
  }

  if (!collection || collection.entries.length === 0) {
    return (
      <div className="empty">
        <h2>No cards yet</h2>
        <p>Scan your first Grand Archive card to start the collection.</p>
        <button type="button" className="btn btn--ghost" onClick={onRefresh}>
          Refresh
        </button>
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
              ? ` · ~${formatUsd(totalValue)} market (${pricedCount}/${collection.uniqueCards} priced)`
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
          <button type="button" className="btn btn--ghost btn--compact" onClick={onRefresh}>
            Refresh
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
        <div className="collection-toolbar__row">
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
        Tap a card to edit. Export uses the current search/filter view.
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
          <p className="export-preview__where muted">
            On Android, saved files go to{" "}
            <strong>Documents/ArchiveBinder/</strong>
            {exportArtifacts.imageName}
            {" "}(Files app → Documents → ArchiveBinder). Or tap Share to send to
            Discord, Drive, Photos, etc.
          </p>
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

          <div
            className="finish-toggle"
            role="group"
            aria-label="Card finish"
          >
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
        {visible.map(({ entry, unit, line, url }) => (
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
                </span>
                <span className="collection-row__set">
                  {entry.card.setPrefix} #{entry.card.collectorNumber}
                  {unit != null ? ` · ${formatUsd(unit)}` : ""}
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
