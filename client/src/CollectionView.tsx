import { useEffect, useMemo, useState } from "react";
import type { CollectionSummary } from "./types";
import { finishLabel } from "./types";
import {
  prepareExportArtifacts,
  revokeExportArtifacts,
  saveExportImage,
  shareExportArtifacts,
  type ExportArtifacts,
} from "./exportCollection";
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
  const [exportArtifacts, setExportArtifacts] = useState<ExportArtifacts | null>(
    null,
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
      const unit = price?.market ?? null;
      const line = unit != null ? unit * entry.quantity : null;
      return { entry, unit, line, url: price?.url ?? null };
    });
  }, [collection, index]);

  const totalValue = priced.reduce((sum, row) => sum + (row.line ?? 0), 0);
  const pricedCount = priced.filter((r) => r.line != null).length;

  function closeExportPreview() {
    revokeExportArtifacts(exportArtifacts);
    setExportArtifacts(null);
  }

  async function handleExport() {
    if (!collection || priced.length === 0 || exporting) return;
    setExporting(true);
    onStatus?.(null);
    onError?.(null);
    try {
      const artifacts = await prepareExportArtifacts(priced, {
        cards: collection.totalCards,
        unique: collection.uniqueCards,
        market: totalValue,
        priced: pricedCount,
      });
      revokeExportArtifacts(exportArtifacts);
      setExportArtifacts(artifacts);
      onStatus?.("Export ready — preview below, then Share or Save image");
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
        </div>
        <div className="collection-view__actions">
          <button
            type="button"
            className="btn btn--primary btn--compact"
            onClick={() => void handleExport()}
            disabled={exporting}
          >
            {exporting ? "Preparing…" : "Export"}
          </button>
          <button type="button" className="btn btn--ghost btn--compact" onClick={onRefresh}>
            Refresh
          </button>
        </div>
      </header>

      <p className="collection-view__export-hint muted">
        Export builds a checklist PNG + CSV. There is no PDF — use Share to send
        the image, or Save image to Documents/ArchiveBinder.
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
