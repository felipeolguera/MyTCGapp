import { useEffect, useMemo, useState } from "react";
import type { CardFinish, GaCardEdition } from "./types";
import { finishLabel } from "./types";
import {
  readGeoDefaults,
  rememberGeoAfterSave,
  type BinderGeoDefaults,
} from "./binderGeoDefaults";
import {
  normalizeBinderLabel,
  normalizeBinderPage,
} from "./types";
import type { PageScanCell } from "./pageScan";
import { pageScanStatus } from "./pageScan";

export interface PageConfirmSaveMeta {
  binder: string;
  page: number | null;
  cells: Array<{
    slot: number;
    card: GaCardEdition;
    finish: CardFinish;
  }>;
}

interface PageConfirmGridProps {
  cells: PageScanCell[];
  onChange: (cells: PageScanCell[]) => void;
  onSaveAll: (meta: PageConfirmSaveMeta) => void;
  onRetake: () => void;
  saving?: boolean;
  scanIntent?: "add" | "audit";
}

export function PageConfirmGrid({
  cells,
  onChange,
  onSaveAll,
  onRetake,
  saving,
  scanIntent = "add",
}: PageConfirmGridProps) {
  const [geo, setGeo] = useState<BinderGeoDefaults>(() => readGeoDefaults());
  const [activeSlot, setActiveSlot] = useState<number | null>(null);

  useEffect(() => {
    setGeo(readGeoDefaults());
  }, [cells]);

  const cols = useMemo(() => {
    const maxCol = cells.reduce((m, c) => Math.max(m, c.col), 0);
    return maxCol + 1;
  }, [cells]);

  const readyCount = cells.filter((c) => c.selected && !c.skipped).length;
  const active = cells.find((c) => c.slot === activeSlot) ?? null;

  function patchCell(slot: number, patch: Partial<PageScanCell>) {
    onChange(
      cells.map((c) => (c.slot === slot ? { ...c, ...patch } : c)),
    );
  }

  function cycleMatch(cell: PageScanCell) {
    if (cell.matches.length === 0) return;
    if (!cell.selected) {
      patchCell(cell.slot, {
        selected: cell.matches[0].card,
        skipped: false,
        uncertain: cell.matches.length > 1,
      });
      return;
    }
    const idx = cell.matches.findIndex(
      (m) => m.card.editionId === cell.selected?.editionId,
    );
    const next = cell.matches[(idx + 1) % cell.matches.length];
    patchCell(cell.slot, {
      selected: next.card,
      skipped: false,
      uncertain: cell.matches.length > 1,
    });
  }

  function emitSave() {
    const binder = normalizeBinderLabel(geo.binder);
    const page = normalizeBinderPage(geo.page);
    const selected = cells
      .filter((c) => c.selected && !c.skipped)
      .map((c) => ({
        slot: c.slot,
        card: c.selected!,
        finish: c.finish,
      }));
    if (selected.length === 0) return;
    rememberGeoAfterSave({
      binder: geo.binder,
      page: geo.page,
      slot: String(selected[selected.length - 1]?.slot ?? geo.slot),
      advanceSlot: false,
    });
    onSaveAll({ binder, page, cells: selected });
  }

  return (
    <section className="page-confirm" aria-label="Confirm page scan">
      <div className="page-confirm__head">
        <div>
          <h2>Page scan</h2>
          <p className="muted">{pageScanStatus(cells)}</p>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--compact"
          onClick={onRetake}
          disabled={saving}
        >
          Retake
        </button>
      </div>

      <div className="page-confirm__geo" aria-label="Binder location">
        <label className="collection-toolbar__field">
          <span>Binder</span>
          <input
            type="text"
            value={geo.binder}
            onChange={(e) =>
              setGeo((g) => ({
                ...g,
                binder: e.target.value.slice(0, 40),
              }))
            }
            placeholder="Main, Trade…"
            maxLength={40}
            disabled={saving}
          />
        </label>
        <label className="collection-toolbar__field">
          <span>Page #</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            value={geo.page}
            onChange={(e) => setGeo((g) => ({ ...g, page: e.target.value }))}
            placeholder="—"
            disabled={saving}
          />
        </label>
      </div>

      <div
        className="page-confirm__grid"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {cells.map((cell) => {
          const score = cell.matches.find(
            (m) => m.card.editionId === cell.selected?.editionId,
          )?.score;
          const label = cell.skipped
            ? "Skip"
            : cell.selected?.name ?? "Pick";
          return (
            <button
              key={cell.slot}
              type="button"
              className={
                cell.skipped
                  ? "page-confirm__cell page-confirm__cell--skip"
                  : cell.uncertain
                    ? "page-confirm__cell page-confirm__cell--uncertain"
                    : "page-confirm__cell"
              }
              onClick={() => setActiveSlot(cell.slot)}
              disabled={saving}
              aria-label={`Slot ${cell.slot}: ${label}`}
            >
              <img src={cell.previewUrl} alt="" className="page-confirm__crop" />
              <span className="page-confirm__slot">s{cell.slot}</span>
              <span className="page-confirm__name">{label}</span>
              {score != null && !cell.skipped ? (
                <span className="page-confirm__score">
                  {Math.round(score * 100)}%
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {active && (
        <div className="page-confirm__editor" role="dialog" aria-label={`Edit slot ${active.slot}`}>
          <div className="page-confirm__editor-head">
            <strong>Slot {active.slot}</strong>
            <button
              type="button"
              className="btn btn--ghost btn--compact"
              onClick={() => setActiveSlot(null)}
            >
              Done
            </button>
          </div>
          <div className="page-confirm__editor-body">
            <img
              src={active.selected?.imageUrl ?? active.previewUrl}
              alt=""
              className="page-confirm__editor-thumb"
            />
            <div>
              <p className="page-confirm__editor-title">
                {active.selected?.name ?? "No match"}
              </p>
              {active.selected ? (
                <p className="muted">
                  {active.selected.setPrefix} #{active.selected.collectorNumber}
                </p>
              ) : null}
              <div className="page-confirm__editor-actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--compact"
                  disabled={saving || active.matches.length === 0}
                  onClick={() => cycleMatch(active)}
                >
                  Next match
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--compact"
                  disabled={saving}
                  onClick={() =>
                    patchCell(active.slot, {
                      finish: active.finish === "foil" ? "normal" : "foil",
                    })
                  }
                >
                  {finishLabel(active.finish)}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--compact"
                  disabled={saving}
                  onClick={() =>
                    patchCell(active.slot, {
                      skipped: !active.skipped,
                      selected: active.skipped
                        ? active.matches[0]?.card ?? active.selected
                        : active.selected,
                    })
                  }
                >
                  {active.skipped ? "Include" : "Skip"}
                </button>
              </div>
              {active.matches.length > 1 && (
                <ul className="page-confirm__alts">
                  {active.matches.map((m) => (
                    <li key={m.card.editionId}>
                      <button
                        type="button"
                        className={
                          active.selected?.editionId === m.card.editionId
                            ? "page-confirm__alt page-confirm__alt--on"
                            : "page-confirm__alt"
                        }
                        onClick={() =>
                          patchCell(active.slot, {
                            selected: m.card,
                            skipped: false,
                            uncertain: false,
                          })
                        }
                        disabled={saving}
                      >
                        {m.card.name} · {m.card.setPrefix} ·{" "}
                        {Math.round(m.score * 100)}%
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        className="btn btn--primary page-confirm__save"
        disabled={saving || readyCount === 0}
        onClick={emitSave}
      >
        {saving
          ? "Saving…"
          : scanIntent === "audit"
            ? `Subtract ${readyCount} slot${readyCount === 1 ? "" : "s"}`
            : `Save ${readyCount} card${readyCount === 1 ? "" : "s"}`}
      </button>
    </section>
  );
}
