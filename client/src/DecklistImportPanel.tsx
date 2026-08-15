import { useMemo, useState } from "react";
import { parseDecklist } from "./decklistParse";
import {
  estimateDecklistWorth,
  resolveDecklist,
  type DecklistResolveResult,
  type DecklistWorth,
} from "./decklistResolve";
import { formatUsd, type PriceIndex } from "./prices";
import type { CardFinish } from "./types";

interface DecklistImportPanelProps {
  priceIndex: PriceIndex | null;
  busy?: boolean;
  onCancel: () => void;
  onImport: (payload: {
    binder: string;
    finish: CardFinish;
    resolved: DecklistResolveResult;
  }) => Promise<void>;
}

export function DecklistImportPanel({
  priceIndex,
  busy,
  onCancel,
  onImport,
}: DecklistImportPanelProps) {
  const [text, setText] = useState("");
  const [binder, setBinder] = useState("");
  const [finish, setFinish] = useState<CardFinish>("normal");
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<DecklistResolveResult | null>(null);

  const worth: DecklistWorth | null = useMemo(
    () => (resolved ? estimateDecklistWorth(resolved, priceIndex, finish) : null),
    [resolved, priceIndex, finish],
  );

  async function handleParse() {
    setError(null);
    setResolved(null);
    const parsed = parseDecklist(text);
    if (parsed.lines.length === 0) {
      setError("No card lines found — use lines like “4 Fracturize”.");
      return;
    }
    setResolving(true);
    try {
      const result = await resolveDecklist(parsed, {
        binderName: binder || parsed.title,
      });
      setResolved(result);
      if (!binder.trim()) setBinder(result.binderName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resolve decklist");
    } finally {
      setResolving(false);
    }
  }

  async function handleImport() {
    if (!resolved || resolved.matchedCount === 0) return;
    const name = binder.trim() || resolved.binderName;
    if (!name) {
      setError("Enter a binder name");
      return;
    }
    setError(null);
    await onImport({ binder: name, finish, resolved });
  }

  return (
    <div className="deck-import" role="region" aria-label="Import decklist">
      <div className="deck-import__head">
        <h3>Import decklist</h3>
        <button type="button" className="btn btn--ghost btn--compact" onClick={onCancel}>
          Close
        </button>
      </div>
      <p className="muted deck-import__hint">
        Paste an AdvGA list. We’ll price it and save matched cards into a new binder.
      </p>
      <label className="deck-import__field">
        <span>Decklist</span>
        <textarea
          rows={10}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setResolved(null);
          }}
          placeholder={"// Obla\n# Main Deck\n4 Fracturize\n…"}
          spellCheck={false}
        />
      </label>
      <div className="deck-import__row">
        <label className="deck-import__field deck-import__field--grow">
          <span>Binder name</span>
          <input
            type="text"
            value={binder}
            maxLength={40}
            onChange={(e) => setBinder(e.target.value)}
            placeholder="Obla"
          />
        </label>
        <label className="deck-import__field">
          <span>Finish</span>
          <select
            value={finish}
            onChange={(e) => setFinish(e.target.value as CardFinish)}
          >
            <option value="normal">Normal</option>
            <option value="foil">Foil</option>
          </select>
        </label>
      </div>
      <div className="deck-import__actions">
        <button
          type="button"
          className="btn btn--ghost btn--compact"
          onClick={() => void handleParse()}
          disabled={resolving || busy || !text.trim()}
        >
          {resolving ? "Matching…" : "Preview worth"}
        </button>
        <button
          type="button"
          className="btn btn--primary btn--compact"
          onClick={() => void handleImport()}
          disabled={
            busy || resolving || !resolved || resolved.matchedCount === 0
          }
        >
          {busy ? "Importing…" : "Import to binder"}
        </button>
      </div>
      {error && (
        <p className="banner banner--warn" role="alert">
          {error}
        </p>
      )}
      {worth && resolved && (
        <div className="deck-import__preview">
          <p className="deck-import__total">
            <span className="muted">Estimated worth</span>
            <strong>{formatUsd(worth.total)}</strong>
          </p>
          <p className="muted deck-import__meta">
            {resolved.matchedCount} matched
            {resolved.unmatchedCount > 0
              ? ` · ${resolved.unmatchedCount} unmatched`
              : ""}
            {worth.unpricedCards > 0
              ? ` · ${worth.unpricedCards} unpriced`
              : ""}
            {" · "}
            {resolved.totalCards} cards
          </p>
          <ul className="deck-import__list">
            {worth.lines.map((row) => (
              <li
                key={`${row.section}:${row.name}:${row.status}`}
                className={
                  row.status === "unmatched"
                    ? "deck-import__line deck-import__line--miss"
                    : row.status === "fuzzy"
                      ? "deck-import__line deck-import__line--fuzzy"
                      : "deck-import__line"
                }
              >
                <span className="deck-import__qty">{row.quantity}×</span>
                <span className="deck-import__name">
                  {row.status === "fuzzy" &&
                  row.sourceName.toLowerCase() !== row.name.toLowerCase()
                    ? `${row.sourceName} → ${row.name}`
                    : row.name}
                </span>
                <span className="deck-import__price">
                  {row.line != null ? formatUsd(row.line) : "—"}
                </span>
              </li>
            ))}
          </ul>
          {resolved.unmatchedCount > 0 && (
            <p className="muted">
              Unmatched lines are skipped on import. Check spelling or set codes.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
