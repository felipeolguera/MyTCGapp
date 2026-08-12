import type { CardFinish, GaCardEdition } from "./types";
import { finishLabel } from "./types";
import { QuantityPad } from "./QuantityPad";

interface ScanConfirmSheetProps {
  card: GaCardEdition;
  quantity: string;
  finish: CardFinish;
  matchScore?: number;
  onQuantityChange: (value: string) => void;
  onFinishChange: (finish: CardFinish) => void;
  onSaveNext: () => void;
  onWrongCard: () => void;
  saving?: boolean;
}

/** Compact confirm sheet so the camera can stay live for batch scanning. */
export function ScanConfirmSheet({
  card,
  quantity,
  finish,
  matchScore,
  onQuantityChange,
  onFinishChange,
  onSaveNext,
  onWrongCard,
  saving,
}: ScanConfirmSheetProps) {
  return (
    <section className="scan-confirm" aria-label="Confirm scanned card">
      <div className="scan-confirm__head">
        <img src={card.imageUrl} alt="" className="scan-confirm__thumb" />
        <div className="scan-confirm__meta">
          <h2>{card.name}</h2>
          <p className="muted">
            {card.setPrefix} #{card.collectorNumber}
            {matchScore != null ? ` · ${Math.round(matchScore * 100)}%` : ""}
          </p>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--compact"
          onClick={onWrongCard}
          disabled={saving}
        >
          Wrong
        </button>
      </div>

      <div className="finish-toggle" role="group" aria-label="Card finish">
        {(["normal", "foil"] as CardFinish[]).map((option) => (
          <button
            key={option}
            type="button"
            className={
              finish === option
                ? "finish-toggle__btn finish-toggle__btn--active"
                : "finish-toggle__btn"
            }
            onClick={() => onFinishChange(option)}
            disabled={saving}
          >
            {finishLabel(option)}
          </button>
        ))}
      </div>

      <QuantityPad
        value={quantity}
        onChange={onQuantityChange}
        onSaveNext={onSaveNext}
        saving={saving}
        saveLabel="Save & Next"
      />
    </section>
  );
}
