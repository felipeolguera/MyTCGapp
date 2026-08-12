import { useEffect, useState } from "react";
import type { CardCondition, CardFinish, GaCardEdition } from "./types";
import { CARD_CONDITIONS, finishLabel } from "./types";
import { QuantityPad } from "./QuantityPad";
import {
  finishToPrinting,
  formatUsd,
  loadPriceIndex,
  lookupCardPrice,
} from "./prices";

export interface ScanConfirmSellMeta {
  forSale: boolean;
  condition: CardCondition;
  askingPrice: number | null;
}

interface ScanConfirmSheetProps {
  card: GaCardEdition;
  quantity: string;
  finish: CardFinish;
  matchScore?: number;
  /** Existing owned qty for this card+finish (0 if new). */
  ownedQuantity?: number;
  onQuantityChange: (value: string) => void;
  onFinishChange: (finish: CardFinish) => void;
  onSaveNext: (meta: ScanConfirmSellMeta) => void;
  onWrongCard: () => void;
  saving?: boolean;
}

/** Compact confirm sheet so the camera can stay live for batch scanning. */
export function ScanConfirmSheet({
  card,
  quantity,
  finish,
  matchScore,
  ownedQuantity = 0,
  onQuantityChange,
  onFinishChange,
  onSaveNext,
  onWrongCard,
  saving,
}: ScanConfirmSheetProps) {
  const [unitPrice, setUnitPrice] = useState<number | null>(null);
  const [forSale, setForSale] = useState(false);
  const [condition, setCondition] = useState<CardCondition>("NM");
  const [askMarket, setAskMarket] = useState(false);

  useEffect(() => {
    setForSale(false);
    setCondition("NM");
    setAskMarket(false);
  }, [card.editionId]);

  useEffect(() => {
    let cancelled = false;
    setUnitPrice(null);
    void loadPriceIndex()
      .then((index) => {
        if (cancelled) return;
        const hit = lookupCardPrice(index, card, finishToPrinting(finish));
        setUnitPrice(hit?.market ?? null);
      })
      .catch(() => {
        if (!cancelled) setUnitPrice(null);
      });
    return () => {
      cancelled = true;
    };
  }, [card, finish]);

  const qty = Math.max(1, Number(quantity) || 1);
  const line = unitPrice != null ? unitPrice * qty : null;

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
          {unitPrice != null ? (
            <p className="scan-confirm__price">
              {formatUsd(unitPrice)}
              {line != null && qty > 1 ? ` · ${formatUsd(line)} line` : ""}
            </p>
          ) : null}
          {ownedQuantity > 0 ? (
            <p className="scan-confirm__owned">Already own ×{ownedQuantity}</p>
          ) : null}
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

      <label className="scan-confirm__check">
        <input
          type="checkbox"
          checked={forSale}
          onChange={(e) => setForSale(e.target.checked)}
          disabled={saving}
        />
        For sale
      </label>

      {forSale && (
        <div className="scan-confirm__sell">
          <label className="collection-toolbar__field">
            <span>Condition</span>
            <select
              value={condition}
              onChange={(e) =>
                setCondition(e.target.value as CardCondition)
              }
              disabled={saving}
            >
              {CARD_CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="scan-confirm__check scan-confirm__check--ask">
            <input
              type="checkbox"
              checked={askMarket}
              onChange={(e) => setAskMarket(e.target.checked)}
              disabled={saving || unitPrice == null}
            />
            Ask = market
            {unitPrice != null ? ` (${formatUsd(unitPrice)})` : ""}
          </label>
        </div>
      )}

      <QuantityPad
        value={quantity}
        onChange={onQuantityChange}
        onSaveNext={() =>
          onSaveNext({
            forSale,
            condition,
            askingPrice: forSale && askMarket ? unitPrice : null,
          })
        }
        saving={saving}
        saveLabel="Save & Next"
      />
    </section>
  );
}
