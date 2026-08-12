const GEO_DEFAULTS_KEY = "archive-binder.geo-defaults.v1";

export interface BinderGeoDefaults {
  binder: string;
  page: string;
  slot: string;
  /** After Save & Next, bump slot by 1 when set. */
  advanceSlot: boolean;
}

const EMPTY: BinderGeoDefaults = {
  binder: "",
  page: "",
  slot: "",
  advanceSlot: true,
};

export function readGeoDefaults(): BinderGeoDefaults {
  try {
    const raw = localStorage.getItem(GEO_DEFAULTS_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<BinderGeoDefaults>;
    return {
      binder: typeof parsed.binder === "string" ? parsed.binder.slice(0, 40) : "",
      page: typeof parsed.page === "string" ? parsed.page : "",
      slot: typeof parsed.slot === "string" ? parsed.slot : "",
      advanceSlot: parsed.advanceSlot !== false,
    };
  } catch {
    return { ...EMPTY };
  }
}

export function writeGeoDefaults(next: BinderGeoDefaults): void {
  localStorage.setItem(GEO_DEFAULTS_KEY, JSON.stringify(next));
}

/** Persist last used location; optionally advance slot for the next card. */
export function rememberGeoAfterSave(input: {
  binder: string;
  page: string;
  slot: string;
  advanceSlot: boolean;
}): BinderGeoDefaults {
  let nextSlot = input.slot;
  if (input.advanceSlot && input.slot.trim()) {
    const n = Number(input.slot);
    if (Number.isInteger(n) && n >= 1 && n < 99) {
      nextSlot = String(n + 1);
    }
  }
  const saved: BinderGeoDefaults = {
    binder: input.binder.trim().slice(0, 40),
    page: input.page.trim(),
    slot: nextSlot.trim(),
    advanceSlot: input.advanceSlot,
  };
  writeGeoDefaults(saved);
  return saved;
}
