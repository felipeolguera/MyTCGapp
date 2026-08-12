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
  listCollectionSetPrefixes,
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
  backupReminderMessage,
  formatBackupAge,
  readBackupMeta,
  type BackupMeta,
} from "./backupMeta";
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
import {
  buildAskingTotalClipboard,
  copyText,
  sumAskingTotal,
} from "./sellHelpers";

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
      note?: string;
    },
  ) => Promise<void>;
  onDeleteEntry: (id: string) => Promise<void>;
  onBulkDelete: (ids: string[]) => Promise<void>;
  onRestore: (entries: CollectionEntry[]) => Promise<void>;
  onBulkSetForSale: (ids: string[], forSale: boolean) => Promise<void>;
}

export function CollectionView({
  collection,
  loading,
  onRefresh,
  onStatus,
  onError,
  onUpdateEntry,
  onDeleteEntry,
  onBulkDelete,
  onRestore,
  onBulkSetForSale,
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
  const [editNote, setEditNote] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [query, setQuery] = useState("");
  const [finishFilter, setFinishFilter] =
    useState<CollectionFinishFilter>("all");
  const [saleFilter, setSaleFilter] = useState<CollectionSaleFilter>("all");
  const [setFilter, setSetFilter] = useState<string>("all");
  const [sort, setSort] = useState<CollectionSort>("name");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [backupMeta, setBackupMeta] = useState<BackupMeta>(() =>
    readBackupMeta(),
  );

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
        setPrefix: setFilter,
        sort,
      }),
    [priced, query, finishFilter, saleFilter, setFilter, sort],
  );

  const setPrefixes = useMemo(
    () => (collection ? listCollectionSetPrefixes(collection.entries) : []),
    [collection],
  );

  const totalValue = priced.reduce((sum, row) => sum + (row.line ?? 0), 0);
  const pricedCount = priced.filter((r) => r.line != null).length;
  const visibleCards = visible.reduce((sum, row) => sum + row.entry.quantity, 0);
  const visibleValue = visible.reduce((sum, row) => sum + (row.line ?? 0), 0);
  const visibleAskingTotal = sumAskingTotal(visible);
  const filtered =
    query.trim() !== "" ||
    finishFilter !== "all" ||
    saleFilter !== "all" ||
    setFilter !== "all" ||
    sort !== "name";
  const backupReminder = backupReminderMessage(backupMeta);
  const selectedCount = selectedIds.size;

  function openEditor(entry: CollectionEntry) {
    if (selectMode) {
      toggleSelected(entry.id);
      return;
    }
    setEditing(entry);
    setEditQty(String(entry.quantity));
    setEditFinish(entry.finish);
    setEditForSale(entry.forSale);
    setEditCondition(entry.condition);
    setEditAsking(entry.askingPrice != null ? String(entry.askingPrice) : "");
    setEditNote(entry.note ?? "");
    onError?.(null);
  }

  function closeEditor() {
    setEditing(null);
    setSavingEdit(false);
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds(new Set(visible.map((r) => r.entry.id)));
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
        note: editNote.trim().slice(0, 280),
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

  async function handleBulkDeleteSelected() {
    if (selectedCount === 0 || bulkBusy) return;
    const ok = window.confirm(
      `Delete ${selectedCount} selected line${selectedCount === 1 ? "" : "s"}?`,
    );
    if (!ok) return;
    setBulkBusy(true);
    onError?.(null);
    try {
      await onBulkDelete([...selectedIds]);
      onStatus?.(
        `Deleted ${selectedCount} line${selectedCount === 1 ? "" : "s"}`,
      );
      exitSelectMode();
    } catch (err) {
      onError?.(
        err instanceof Error ? err.message : "Could not delete selected cards",
      );
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkSaleSelected(forSale: boolean) {
    if (selectedCount === 0 || bulkBusy) return;
    setBulkBusy(true);
    onError?.(null);
    try {
      await onBulkSetForSale([...selectedIds], forSale);
      onStatus?.(
        forSale
          ? `Marked ${selectedCount} selected for sale`
          : `Cleared for-sale on ${selectedCount} selected`,
      );
      if (forSale) setSaleFilter("for-sale");
      exitSelectMode();
    } catch (err) {
      onError?.(
        err instanceof Error ? err.message : "Could not update for-sale flags",
      );
    } finally {
      setBulkBusy(false);
    }
  }

  function closeExportPreview() {
    revokeExportArtifacts(exportArtifacts);
    setExportArtifacts(null);
  }

  async function handleExport(sellSheet = false) {
    if (!collection || visible.length === 0 || exporting) return;
    setExporting(true);
    onStatus?.(null);
    onError?.(null);
    try {
      const rows = sellSheet
        ? visible.filter((r) => r.entry.forSale)
        : visible;
      if (rows.length === 0) {
        onError?.(
          sellSheet
            ? "No for-sale cards in this view — mark some first"
            : "Nothing to export",
        );
        return;
      }
      const cards = rows.reduce((n, r) => n + r.entry.quantity, 0);
      const market = rows.reduce((n, r) => n + (r.line ?? 0), 0);
      const artifacts = await prepareExportArtifacts(
        rows,
        {
          cards,
          unique: rows.length,
          market,
          priced: rows.filter((r) => r.line != null).length,
        },
        { sellSheet },
      );
      revokeExportArtifacts(exportArtifacts);
      setExportArtifacts(artifacts);
      onStatus?.(
        sellSheet
          ? `Sell sheet ready · ${rows.length} for-sale lines · ${formatUsd(market)}`
          : filtered
            ? `Export ready for ${rows.length} filtered lines`
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

  async function handleCopyAskingTotal() {
    if (visible.length === 0) return;
    onError?.(null);
    try {
      const text = buildAskingTotalClipboard(visible);
      await copyText(text);
      onStatus?.(`Copied · ${text}`);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Could not copy total");
    }
  }

  async function handleBulkForSale(forSale: boolean) {
    if (visible.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    onError?.(null);
    try {
      await onBulkSetForSale(
        visible.map((r) => r.entry.id),
        forSale,
      );
      onStatus?.(
        forSale
          ? `Marked ${visible.length} lines for sale`
          : `Cleared for-sale on ${visible.length} lines`,
      );
      if (forSale) setSaleFilter("for-sale");
    } catch (err) {
      onError?.(
        err instanceof Error ? err.message : "Could not update for-sale flags",
      );
    } finally {
      setBulkBusy(false);
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
      setBackupMeta(readBackupMeta());
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
          <p className="muted collection-view__backup-meta">
            {formatBackupAge(backupMeta)}
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
            onClick={() => void handleExport(false)}
            disabled={exporting || visible.length === 0 || selectMode}
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
          <button
            type="button"
            className="btn btn--ghost btn--compact"
            onClick={() => {
              if (selectMode) exitSelectMode();
              else {
                closeEditor();
                setSelectMode(true);
              }
            }}
          >
            {selectMode ? "Cancel select" : "Select"}
          </button>
        </div>
      </header>

      {backupReminder && (
        <p
          className="banner banner--warn collection-view__backup-reminder"
          role="status"
        >
          {backupReminder}
        </p>
      )}

      {selectMode && (
        <div className="select-toolbar">
          <span className="select-toolbar__count">
            {selectedCount} selected
          </span>
          <div className="select-toolbar__actions">
            <button
              type="button"
              className="btn btn--ghost btn--compact"
              onClick={selectAllVisible}
              disabled={visible.length === 0}
            >
              Select all
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--compact"
              onClick={() => void handleBulkSaleSelected(true)}
              disabled={selectedCount === 0 || bulkBusy}
            >
              Mark sale
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--compact"
              onClick={() => void handleBulkSaleSelected(false)}
              disabled={selectedCount === 0 || bulkBusy}
            >
              Clear sale
            </button>
            <button
              type="button"
              className="btn btn--danger btn--compact"
              onClick={() => void handleBulkDeleteSelected()}
              disabled={selectedCount === 0 || bulkBusy}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      <div className="sell-toolbar">
        <div className="sell-toolbar__total">
          <span className="sell-toolbar__label">View total</span>
          <strong>{formatUsd(visibleAskingTotal)}</strong>
        </div>
        <div className="sell-toolbar__actions">
          <button
            type="button"
            className="btn btn--ghost btn--compact"
            onClick={() => void handleCopyAskingTotal()}
            disabled={visible.length === 0 || selectMode}
          >
            Copy total
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--compact"
            onClick={() => void handleBulkForSale(true)}
            disabled={visible.length === 0 || bulkBusy || selectMode}
          >
            Mark for sale
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--compact"
            onClick={() => void handleBulkForSale(false)}
            disabled={visible.length === 0 || bulkBusy || selectMode}
          >
            Clear sale
          </button>
          <button
            type="button"
            className="btn btn--primary btn--compact"
            onClick={() => void handleExport(true)}
            disabled={exporting || visible.length === 0 || selectMode}
          >
            Sell sheet
          </button>
        </div>
      </div>

      <div className="collection-toolbar">
        <label className="collection-toolbar__search" htmlFor="collection-query">
          <span className="sr-only">Search collection</span>
          <input
            id="collection-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, set, #, or note"
            autoComplete="off"
            enterKeyHint="search"
          />
        </label>
        <div className="collection-toolbar__row collection-toolbar__row--2">
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
        </div>
        <div className="collection-toolbar__row collection-toolbar__row--2">
          <label className="collection-toolbar__field">
            <span>Set</span>
            <select
              value={setFilter}
              onChange={(e) => setSetFilter(e.target.value)}
            >
              <option value="all">All sets</option>
              {setPrefixes.map((prefix) => (
                <option key={prefix} value={prefix}>
                  {prefix}
                </option>
              ))}
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
        Mark filtered cards for sale, copy the view total for listings, or export
        a sell sheet (for-sale lines only, with condition).
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

      {editing && !selectMode && (
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

          <label className="entry-editor__note">
            <span>Note</span>
            <textarea
              value={editNote}
              onChange={(e) => setEditNote(e.target.value.slice(0, 280))}
              placeholder="Buyer note, trade interest…"
              rows={2}
              maxLength={280}
              disabled={savingEdit}
            />
          </label>

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
        {visible.map(({ entry, unit, line, url, market }) => {
          const selected = selectedIds.has(entry.id);
          return (
            <li
              key={entry.id}
              className={
                selected
                  ? "collection-row collection-row--selected"
                  : "collection-row"
              }
            >
              <button
                type="button"
                className="collection-row__main"
                onClick={() => openEditor(entry)}
                aria-label={
                  selectMode
                    ? `${selected ? "Deselect" : "Select"} ${entry.card.name}`
                    : `Edit ${entry.card.name}`
                }
                aria-pressed={selectMode ? selected : undefined}
              >
                {selectMode && (
                  <span
                    className={
                      selected
                        ? "collection-row__check collection-row__check--on"
                        : "collection-row__check"
                    }
                    aria-hidden
                  />
                )}
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
                  {entry.note ? (
                    <span className="collection-row__note">{entry.note}</span>
                  ) : null}
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
              {url && !selectMode && (
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
          );
        })}
      </ul>

      {visible.length === 0 && (
        <p className="muted collection-view__empty-filter">
          No cards match this search/filter.
        </p>
      )}
    </section>
  );
}
