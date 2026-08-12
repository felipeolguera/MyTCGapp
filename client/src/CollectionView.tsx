import type { CollectionSummary } from "./types";

interface CollectionViewProps {
  collection: CollectionSummary | null;
  loading?: boolean;
  onRefresh: () => void;
}

export function CollectionView({
  collection,
  loading,
  onRefresh,
}: CollectionViewProps) {
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
          </p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={onRefresh}>
          Refresh
        </button>
      </header>

      <ul className="collection-list">
        {collection.entries.map((entry) => (
          <li key={entry.editionId} className="collection-row">
            <img
              src={entry.card.imageUrl}
              alt=""
              className="collection-row__thumb"
              loading="lazy"
            />
            <div className="collection-row__body">
              <span className="collection-row__name">{entry.card.name}</span>
              <span className="collection-row__set">
                {entry.card.setPrefix} #{entry.card.collectorNumber}
              </span>
            </div>
            <span className="collection-row__qty" aria-label="Quantity">
              ×{entry.quantity}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
