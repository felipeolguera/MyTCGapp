import type { GaCardEdition } from "./types";

interface MatchChoicePopupProps {
  cards: GaCardEdition[];
  scores?: Record<string, number>;
  onPick: (card: GaCardEdition) => void;
  onDismiss: () => void;
  busy?: boolean;
}

/** Centered in-viewfinder match picker for snap → add flow. */
export function MatchChoicePopup({
  cards,
  scores = {},
  onPick,
  onDismiss,
  busy,
}: MatchChoicePopupProps) {
  return (
    <div className="camera__match-overlay" role="dialog" aria-label="Choose card">
      <div className="camera__match-sheet">
        <div className="camera__match-head">
          <strong>Pick card</strong>
          <button
            type="button"
            className="btn btn--ghost btn--compact"
            onClick={onDismiss}
            disabled={busy}
          >
            Retake
          </button>
        </div>
        <ul className="camera__match-list">
          {cards.map((card, idx) => (
            <li key={card.editionId}>
              <button
                type="button"
                className={
                  idx === 0
                    ? "camera__match-row camera__match-row--best"
                    : "camera__match-row"
                }
                onClick={() => onPick(card)}
                disabled={busy}
              >
                <img src={card.imageUrl} alt="" loading="lazy" />
                <span>
                  <strong>
                    {idx === 0 ? "Best · " : ""}
                    {card.name}
                  </strong>
                  <small>
                    {card.setPrefix} #{card.collectorNumber}
                    {scores[card.editionId] != null
                      ? ` · ${Math.round(scores[card.editionId] * 100)}%`
                      : ""}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
