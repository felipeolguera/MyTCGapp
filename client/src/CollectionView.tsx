import { useEffect, useMemo, useState } from "react";
import type { CollectionSummary } from "./types";
import { finishLabel } from "./types";
import { exportCollectionInventory } from "./exportCollection";
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
}

export function CollectionView({
  collection,
  loading,
  onRefresh,
  onStatus,
  onError,
}: CollectionViewProps) {
  const [index, setIndex] = useState<PriceIndex | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    void loadPriceIndex()
      .then(setIndex)
      .catch(() => setIndex(null));
  }, []);

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

  const totalValue = priced.reduce((sum, row) => sum + (row.line ?? 0), 0);
  const pricedCount = priced.filter((r) => r.line != null).length;

  async function handleExport() {
    if (!collection || priced.length === 0 || exporting) return;
    setExporting(true);
    onStatus?.(null);
    onError?.(null);
    try {
      const result = await exportCollectionInventory(priced, {
        cards: collection.totalCards,
        unique: collection.uniqueCards,
        market: totalValue,
        priced: pricedCount,
      });
      if (result.mode === "shared") {
        onStatus?.("Collection shared");
      } else if (result.mode === "copied") {
        onStatus?.("CSV downloaded · list copied to clipboard");
      } else {
        onStatus?.("CSV downloaded — send that file to buyers");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        onStatus?.(null);
        return;
      }
      onError?.(
        err instanceof Error ? err.message : "Could not export collection",
      );
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
        </div>
        <div className="collection-view__actions">
          <button
            type="button"
            className="btn btn--primary btn--compact"
            onClick={() => void handleExport()}
            disabled={exporting}
          >
            {exporting ? "Exporting…" : "Export"}
          </button>
          <button type="button" className="btn btn--ghost btn--compact" onClick={onRefresh}>
            Refresh
          </button>
        </div>
      </header>

      <p className="collection-view__export-hint muted">
        Export shares a sellable inventory list and CSV (name, set, finish, qty,
        market price, TCGPlayer link).
      </p>

      <ul className="collection-list">
        {priced.map(({ entry, unit, line, url }) => (
          <li key={entry.id} className="collection-row">
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
              {url && (
                <a
                  className="collection-row__link"
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`TCGPlayer page for ${entry.card.name}`}
                >
                  $
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
