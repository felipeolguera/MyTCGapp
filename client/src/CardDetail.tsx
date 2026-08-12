import { useEffect, useState } from "react";
import type { CardFinish, GaCardEdition } from "./types";
import { finishLabel } from "./types";
import { QuantityPad } from "./QuantityPad";
import {
  finishToPrinting,
  formatUsd,
  loadPriceIndex,
  lookupCardPrice,
  type CardPrice,
} from "./prices";

const RARITY_LABEL: Record<number, string> = {
  1: "C",
  2: "U",
  3: "R",
  4: "SR",
  5: "UR",
  6: "Promo",
};

interface CardDetailProps {
  card: GaCardEdition;
  quantity: string;
  finish: CardFinish;
  onQuantityChange: (value: string) => void;
  onFinishChange: (finish: CardFinish) => void;
  onSaveNext: () => void;
  onBack: () => void;
  saving?: boolean;
}

export function CardDetail({
  card,
  quantity,
  finish,
  onQuantityChange,
  onFinishChange,
  onSaveNext,
  onBack,
  saving,
}: CardDetailProps) {
  const [price, setPrice] = useState<CardPrice | null>(null);
  const [priceStatus, setPriceStatus] = useState<"loading" | "ready" | "missing">(
    "loading",
  );

  useEffect(() => {
    let cancelled = false;
    setPriceStatus("loading");
    void loadPriceIndex()
      .then((index) => {
        if (cancelled) return;
        const hit = lookupCardPrice(index, card, finishToPrinting(finish));
        setPrice(hit);
        setPriceStatus(hit?.market != null ? "ready" : "missing");
      })
      .catch(() => {
        if (!cancelled) setPriceStatus("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [card, finish]);

  const lineTotal =
    price?.market != null ? price.market * Math.max(1, Number(quantity) || 1) : null;

  return (
    <section className="detail">
      <button type="button" className="btn btn--ghost" onClick={onBack}>
        ← Wrong card
      </button>

      <div className="detail__hero">
        <img
          className="detail__art"
          src={card.imageUrl}
          alt={card.name}
          loading="eager"
        />
      </div>

      <div className="detail__meta">
        <h2 className="detail__name">{card.name}</h2>
        <p className="detail__set">
          {card.setPrefix} · #{card.collectorNumber}
          {card.setName ? ` · ${card.setName}` : ""}
        </p>

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
                finish === option
                  ? "finish-toggle__btn finish-toggle__btn--active"
                  : "finish-toggle__btn"
              }
              onClick={() => onFinishChange(option)}
            >
              {finishLabel(option)}
            </button>
          ))}
        </div>

        <div className="price-block" data-testid="tcgplayer-price">
          <div className="price-block__main">
            <span className="price-block__label">TCGPlayer market</span>
            <span className="price-block__value">
              {priceStatus === "loading"
                ? "…"
                : formatUsd(price?.market ?? null)}
            </span>
          </div>
          {price?.market != null && (
            <p className="price-block__meta">
              {price.printing}
              {price.low != null ? ` · low ${formatUsd(price.low)}` : ""}
              {price.mid != null ? ` · mid ${formatUsd(price.mid)}` : ""}
              {lineTotal != null && Number(quantity) > 1
                ? ` · line ${formatUsd(lineTotal)}`
                : ""}
            </p>
          )}
          {price?.url && (
            <a
              className="price-block__link"
              href={price.url}
              target="_blank"
              rel="noreferrer"
            >
              View on TCGPlayer
            </a>
          )}
          {priceStatus === "missing" && (
            <p className="price-block__meta">No TCGPlayer price found</p>
          )}
        </div>

        <div className="detail__chips">
          {card.types.map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
          {card.element && <span className="chip">{card.element}</span>}
          <span className="chip">
            {RARITY_LABEL[card.rarity] ?? `R${card.rarity}`}
          </span>
        </div>
        {card.effect && <p className="detail__effect">{card.effect}</p>}
      </div>

      <QuantityPad
        value={quantity}
        onChange={onQuantityChange}
        onSaveNext={onSaveNext}
        saving={saving}
      />
    </section>
  );
}
