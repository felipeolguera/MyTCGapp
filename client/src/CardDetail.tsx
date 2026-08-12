import type { GaCardEdition } from "./types";
import { QuantityPad } from "./QuantityPad";

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
  onQuantityChange: (value: string) => void;
  onSaveNext: () => void;
  onBack: () => void;
  saving?: boolean;
}

export function CardDetail({
  card,
  quantity,
  onQuantityChange,
  onSaveNext,
  onBack,
  saving,
}: CardDetailProps) {
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
