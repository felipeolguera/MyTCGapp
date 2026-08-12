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
  formatPriceIndexAge,
  formatUsd,
  installPriceIndex,
  loadPriceIndex,
  lookupCardPrice,
  type PriceIndex,
} from "./prices";
import { refreshPriceIndexFromTcgcsv } from "./priceRefresh";
import {
  clearMovers,
  evaluatePriceAlerts,
  formatMoverLine,
  formatMoversSummary,
  readAlertSettings,
  readMovers,
  writeAlertSettings,
  type PriceMover,
} from "./priceAlerts";
import {
  buildAskingTotalClipboard,
  buildCartReceiptClipboard,
  buildListingLineClipboard,
  copyText,
  sumAskingTotal,
} from "./sellHelpers";
import {
  buildSaleReceipt,
  canUndoSale,
  formatLedgerSummary,
  peekLastSale,
  popLastSale,
  readSalesLedger,
  recordSale,
  type SaleLine,
} from "./salesLedger";
import { exportCardCode } from "./exportCollection";
import { marketTimesPercent, parseAskPercent } from "./sellPricing";

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
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [ledgerSummary, setLedgerSummary] = useState(() =>
    formatLedgerSummary(readSalesLedger()),
  );
  const [askPercent, setAskPercent] = useState("90");
  const [alertThreshold, setAlertThreshold] = useState(() =>
    String(readAlertSettings().thresholdPercent),
  );
  const [movers, setMovers] = useState<PriceMover[]>(() => readMovers());
  const [showMovers, setShowMovers] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showSell, setShowSell] = useState(false);
  const [canUndo, setCanUndo] = useState(() => {
    const last = peekLastSale();
    return Boolean(last && canUndoSale(last));
  });

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
  const visibleCards = visible.reduce((sum, row) => sum + row.entry.quantity, 0);
  const visibleAskingTotal = sumAskingTotal(visible);
  const filtered =
    query.trim() !== "" ||
    finishFilter !== "all" ||
    saleFilter !== "all" ||
    setFilter !== "all" ||
    sort !== "name";
  const backupReminder = backupReminderMessage(backupMeta);
  const selectedCount = selectedIds.size;
  const selectedRows = useMemo(
    () => visible.filter((r) => selectedIds.has(r.entry.id)),
    [visible, selectedIds],
  );
  const cartTotal = sumAskingTotal(selectedRows);
  const cartCards = selectedRows.reduce((n, r) => n + r.entry.quantity, 0);

  function toSaleLines(
    rows: Array<{ entry: CollectionEntry; unit: number | null }>,
    quantityFor: (entry: CollectionEntry) => number,
  ): SaleLine[] {
    return rows.map(({ entry, unit }) => ({
      entryId: entry.id,
      name: entry.card.name,
      finish: entry.finish,
      condition: entry.condition,
      setCode: exportCardCode(entry),
      quantity: quantityFor(entry),
      unitPrice: entry.askingPrice ?? unit,
      card: entry.card,
      forSale: entry.forSale,
      askingPrice: entry.askingPrice,
      note: entry.note,
    }));
  }

  function bumpLedger() {
    setLedgerSummary(formatLedgerSummary(readSalesLedger()));
    const last = peekLastSale();
    setCanUndo(Boolean(last && canUndoSale(last)));
  }

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

  async function handleCopyListingLine(row: {
    entry: CollectionEntry;
    unit: number | null;
    line: number | null;
    url: string | null;
    market?: number | null;
  }) {
    onError?.(null);
    try {
      const text = buildListingLineClipboard(row);
      await copyText(text);
      onStatus?.(`Copied · ${text}`);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Could not copy line");
    }
  }

  async function handleSoldOne(entry: CollectionEntry) {
    if (bulkBusy) return;
    setBulkBusy(true);
    onError?.(null);
    try {
      const row = priced.find((r) => r.entry.id === entry.id);
      const unit = entry.askingPrice ?? row?.unit ?? null;
      recordSale(
        toSaleLines([{ entry, unit }], () => 1),
        "sold-one",
      );
      bumpLedger();
      const nextQty = entry.quantity - 1;
      if (nextQty < 1) {
        await onDeleteEntry(entry.id);
        onStatus?.(`Sold out · removed ${entry.card.name}`);
      } else {
        await onUpdateEntry(entry.id, {
          quantity: nextQty,
          finish: entry.finish,
          card: entry.card,
          forSale: entry.forSale,
          condition: entry.condition,
          askingPrice: entry.askingPrice,
          note: entry.note,
        });
        onStatus?.(`Sold −1 · ${entry.card.name} now ×${nextQty}`);
      }
      if (editing?.id === entry.id) closeEditor();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Could not mark sold");
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkSoldSelected() {
    if (selectedCount === 0 || bulkBusy) return;
    setBulkBusy(true);
    onError?.(null);
    try {
      recordSale(
        toSaleLines(selectedRows, () => 1),
        "sold-one",
      );
      bumpLedger();
      for (const { entry } of selectedRows) {
        const nextQty = entry.quantity - 1;
        if (nextQty < 1) {
          await onDeleteEntry(entry.id);
        } else {
          await onUpdateEntry(entry.id, {
            quantity: nextQty,
            finish: entry.finish,
            card: entry.card,
            forSale: entry.forSale,
            condition: entry.condition,
            askingPrice: entry.askingPrice,
            note: entry.note,
          });
        }
      }
      onStatus?.(
        `Sold −1 on ${selectedRows.length} line${selectedRows.length === 1 ? "" : "s"}`,
      );
      exitSelectMode();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Could not mark sold");
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleCopyCart() {
    if (selectedRows.length === 0) return;
    onError?.(null);
    try {
      const text = buildCartReceiptClipboard(selectedRows);
      await copyText(text);
      onStatus?.(`Cart copied · ${cartCards} cards · ${formatUsd(cartTotal)}`);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Could not copy cart");
    }
  }

  async function handleCheckout() {
    if (selectedRows.length === 0 || bulkBusy) return;
    const ok = window.confirm(
      `Checkout ${cartCards} card${cartCards === 1 ? "" : "s"} for ${formatUsd(cartTotal)}? This sells the full selected quantities.`,
    );
    if (!ok) return;
    setBulkBusy(true);
    onError?.(null);
    try {
      const sale = recordSale(
        toSaleLines(selectedRows, (e) => e.quantity),
        "checkout",
      );
      bumpLedger();
      for (const { entry } of selectedRows) {
        await onDeleteEntry(entry.id);
      }
      try {
        await copyText(buildSaleReceipt(sale));
      } catch {
        // Clipboard may be blocked; inventory still sold.
      }
      onStatus?.(
        `Checked out · ${sale.cardCount} cards · ${formatUsd(sale.total)}`,
      );
      exitSelectMode();
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleRefreshPrices() {
    if (refreshingPrices) return;
    setRefreshingPrices(true);
    onError?.(null);
    onStatus?.("Refreshing prices from TCGCSV…");
    try {
      const next = await refreshPriceIndexFromTcgcsv((p) => {
        onStatus?.(
          `Refreshing prices ${Math.min(p.done + 1, p.total)}/${p.total} · ${p.label}`,
        );
      });
      const installed = installPriceIndex(next);
      setIndex(installed);

      const threshold =
        Number(alertThreshold) > 0
          ? Number(alertThreshold)
          : readAlertSettings().thresholdPercent;
      writeAlertSettings({ thresholdPercent: threshold });

      const rows =
        collection?.entries.map((entry) => {
          const hit = lookupCardPrice(
            installed,
            entry.card,
            finishToPrinting(entry.finish),
          );
          return { entry, market: hit?.market ?? null };
        }) ?? [];

      const result = evaluatePriceAlerts(rows, threshold);
      setMovers(result.movers);
      if (result.firstBaseline) {
        onStatus?.(
          `Prices updated · baseline saved · ${formatPriceIndexAge(installed)}`,
        );
      } else if (result.movers.length > 0) {
        setShowMovers(true);
        onStatus?.(
          `Prices updated · ${formatMoversSummary(result.movers)} (≥${threshold}%)`,
        );
      } else {
        onStatus?.(
          `Prices updated · no movers ≥${threshold}% · ${formatPriceIndexAge(installed)}`,
        );
      }
    } catch (err) {
      onError?.(
        err instanceof Error ? err.message : "Could not refresh prices",
      );
    } finally {
      setRefreshingPrices(false);
    }
  }

  function handleSaveAlertThreshold() {
    const n = Number(alertThreshold);
    if (!Number.isFinite(n) || n <= 0 || n > 500) {
      onError?.("Alert threshold must be 1–500%");
      return;
    }
    writeAlertSettings({ thresholdPercent: n });
    setAlertThreshold(String(n));
    onStatus?.(`Price alerts at ≥${n}% since last refresh`);
  }

  function handleClearMovers() {
    clearMovers();
    setMovers([]);
    setShowMovers(false);
    onStatus?.("Cleared price alerts");
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

  async function handleBulkAskPercent() {
    if (visible.length === 0 || bulkBusy) return;
    const percent = parseAskPercent(askPercent);
    if (percent == null) {
      onError?.("Enter a percent from 0–500 (e.g. 90)");
      return;
    }
    const targets = visible.filter((r) => r.market != null);
    if (targets.length === 0) {
      onError?.("No market prices in this view — refresh prices first");
      return;
    }
    const ok = window.confirm(
      `Set asking to ${percent}% of market on ${targets.length} line${targets.length === 1 ? "" : "s"}?`,
    );
    if (!ok) return;
    setBulkBusy(true);
    onError?.(null);
    try {
      let updated = 0;
      for (const { entry, market } of targets) {
        const asking = marketTimesPercent(market, percent);
        if (asking == null) continue;
        await onUpdateEntry(entry.id, {
          quantity: entry.quantity,
          finish: entry.finish,
          card: entry.card,
          forSale: entry.forSale,
          condition: entry.condition,
          askingPrice: asking,
          note: entry.note,
        });
        updated += 1;
      }
      onStatus?.(
        `Ask = ${percent}% market on ${updated} line${updated === 1 ? "" : "s"}`,
      );
    } catch (err) {
      onError?.(
        err instanceof Error ? err.message : "Could not set asking prices",
      );
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleUndoLastSale() {
    if (bulkBusy || !canUndo) return;
    const last = peekLastSale();
    if (!last || !canUndoSale(last)) {
      onError?.("Nothing to undo (older sales lack restore data)");
      return;
    }
    const ok = window.confirm(
      `Undo last sale · ${last.cardCount} card${last.cardCount === 1 ? "" : "s"} · ${formatUsd(last.total)}?`,
    );
    if (!ok) return;
    setBulkBusy(true);
    onError?.(null);
    try {
      const sale = popLastSale();
      if (!sale) throw new Error("Sale already undone");
      for (const line of sale.lines) {
        if (!line.card) continue;
        const existing = collection?.entries.find((e) => e.id === line.entryId);
        const nextQty = (existing?.quantity ?? 0) + line.quantity;
        await onUpdateEntry(line.entryId, {
          quantity: nextQty,
          finish: line.finish,
          card: line.card,
          forSale: line.forSale ?? existing?.forSale ?? false,
          condition: line.condition,
          askingPrice:
            line.askingPrice !== undefined
              ? line.askingPrice
              : (existing?.askingPrice ?? null),
          note: line.note ?? existing?.note ?? "",
        });
      }
      bumpLedger();
      onStatus?.(
        `Undid sale · restored ${sale.cardCount} card${sale.cardCount === 1 ? "" : "s"}`,
      );
    } catch (err) {
      bumpLedger();
      onError?.(err instanceof Error ? err.message : "Could not undo sale");
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
          <p className="muted collection-view__summary">
            {collection.totalCards} cards · {collection.uniqueCards} unique
            {index
              ? ` · ~${formatUsd(totalValue)}`
              : ""}
            {filtered
              ? ` · showing ${visibleCards}`
              : ""}
          </p>
          <p className="muted collection-view__meta-line">
            {formatBackupAge(backupMeta)}
            {" · "}
            {formatPriceIndexAge(index)}
            {" · "}
            {ledgerSummary}
            {canUndo ? " · undo" : ""}
            {movers.length > 0
              ? ` · ${formatMoversSummary(movers)}`
              : ""}
          </p>
        </div>
        <div className="collection-view__actions">
          <button
            type="button"
            className={
              showTools
                ? "btn btn--ghost btn--compact btn--toggle-on"
                : "btn btn--ghost btn--compact"
            }
            aria-expanded={showTools}
            onClick={() => {
              setShowTools((v) => !v);
              if (!showTools) setShowSell(false);
            }}
          >
            Tools
          </button>
          <button
            type="button"
            className={
              showSell
                ? "btn btn--ghost btn--compact btn--toggle-on"
                : "btn btn--ghost btn--compact"
            }
            aria-expanded={showSell}
            onClick={() => {
              setShowSell((v) => !v);
              if (!showSell) setShowTools(false);
            }}
            disabled={selectMode}
          >
            Sell
          </button>
          <button
            type="button"
            className="btn btn--primary btn--compact"
            onClick={() => {
              if (selectMode) exitSelectMode();
              else {
                closeEditor();
                setShowTools(false);
                setShowSell(false);
                setSelectMode(true);
              }
            }}
          >
            {selectMode ? "Done" : "Select"}
          </button>
        </div>
      </header>

      {showTools && !selectMode && (
        <div className="panel-sheet" role="region" aria-label="Collection tools">
          <div className="panel-sheet__actions">
            <button
              type="button"
              className="btn btn--primary btn--compact"
              onClick={() => void handleExport(false)}
              disabled={exporting || visible.length === 0}
            >
              {exporting ? "Preparing…" : filtered ? "Export view" : "Export"}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--compact"
              onClick={() => void handleRefreshPrices()}
              disabled={refreshingPrices}
            >
              {refreshingPrices ? "Prices…" : "Refresh prices"}
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
        </div>
      )}

      {backupReminder && (
        <p
          className="banner banner--warn collection-view__backup-reminder"
          role="status"
        >
          {backupReminder}
        </p>
      )}

      {movers.length > 0 && (
        <div className="price-alerts" role="status">
          <div className="price-alerts__head">
            <strong>{formatMoversSummary(movers)}</strong>
            <div className="price-alerts__actions">
              <button
                type="button"
                className="btn btn--ghost btn--compact"
                onClick={() => setShowMovers((v) => !v)}
              >
                {showMovers ? "Hide" : "Show"}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--compact"
                onClick={handleClearMovers}
              >
                Clear
              </button>
            </div>
          </div>
          {showMovers && (
            <ul className="price-alerts__list">
              {movers.slice(0, 20).map((m) => (
                <li key={m.entryId}>
                  <span
                    className={
                      m.changePercent > 0
                        ? "price-alerts__up"
                        : "price-alerts__down"
                    }
                  >
                    {formatMoverLine(m)}
                  </span>
                </li>
              ))}
              {movers.length > 20 && (
                <li className="muted">+{movers.length - 20} more</li>
              )}
            </ul>
          )}
        </div>
      )}

      {selectMode && (
        <div className="select-toolbar">
          <div className="select-toolbar__summary">
            <span className="select-toolbar__count">
              {selectedCount} selected
            </span>
            {selectedCount > 0 && (
              <strong className="select-toolbar__cart">
                Cart {formatUsd(cartTotal)} · {cartCards} pcs
              </strong>
            )}
          </div>
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
              onClick={() => void handleCopyCart()}
              disabled={selectedCount === 0}
            >
              Copy cart
            </button>
            <button
              type="button"
              className="btn btn--primary btn--compact"
              onClick={() => void handleCheckout()}
              disabled={selectedCount === 0 || bulkBusy}
            >
              Checkout
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
              className="btn btn--ghost btn--compact"
              onClick={() => void handleBulkSoldSelected()}
              disabled={selectedCount === 0 || bulkBusy}
            >
              Sold −1
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

      {showSell && !selectMode && (
        <div className="panel-sheet panel-sheet--sell" role="region" aria-label="Sell tools">
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
                disabled={visible.length === 0}
              >
                Copy total
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--compact"
                onClick={() => void handleBulkForSale(true)}
                disabled={visible.length === 0 || bulkBusy}
              >
                Mark for sale
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--compact"
                onClick={() => void handleBulkForSale(false)}
                disabled={visible.length === 0 || bulkBusy}
              >
                Clear sale
              </button>
              <button
                type="button"
                className="btn btn--primary btn--compact"
                onClick={() => void handleExport(true)}
                disabled={exporting || visible.length === 0}
              >
                Sell sheet
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--compact"
                onClick={() => void handleUndoLastSale()}
                disabled={!canUndo || bulkBusy}
              >
                Undo sale
              </button>
            </div>
          </div>

          <div className="ask-toolbar">
            <label className="ask-toolbar__field" htmlFor="ask-percent">
              <span>Ask %</span>
              <input
                id="ask-percent"
                value={askPercent}
                onChange={(e) => setAskPercent(e.target.value)}
                inputMode="decimal"
                disabled={bulkBusy}
                aria-label="Asking price as percent of market"
              />
            </label>
            <button
              type="button"
              className="btn btn--ghost btn--compact"
              onClick={() => void handleBulkAskPercent()}
              disabled={visible.length === 0 || bulkBusy}
            >
              Ask = market × %
            </button>
            <label className="ask-toolbar__field" htmlFor="alert-threshold">
              <span>Alert ≥%</span>
              <input
                id="alert-threshold"
                value={alertThreshold}
                onChange={(e) => setAlertThreshold(e.target.value)}
                onBlur={handleSaveAlertThreshold}
                inputMode="decimal"
                aria-label="Price alert threshold percent"
              />
            </label>
          </div>
        </div>
      )}

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
              {!selectMode && (
                <div className="collection-row__actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--compact"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleCopyListingLine({
                        entry,
                        unit,
                        line,
                        url,
                        market,
                      });
                    }}
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--compact"
                    disabled={bulkBusy}
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleSoldOne(entry);
                    }}
                  >
                    Sold −1
                  </button>
                </div>
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
