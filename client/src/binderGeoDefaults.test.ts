import { describe, expect, it, beforeEach } from "vitest";
import {
  readGeoDefaults,
  rememberGeoAfterSave,
  writeGeoDefaults,
} from "./binderGeoDefaults";

const memory = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => {
    memory.set(key, value);
  },
  removeItem: (key: string) => {
    memory.delete(key);
  },
  clear: () => memory.clear(),
};

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  configurable: true,
});

describe("binderGeoDefaults", () => {
  beforeEach(() => memory.clear());

  it("defaults empty with advance enabled", () => {
    expect(readGeoDefaults()).toEqual({
      binder: "",
      page: "",
      slot: "",
      advanceSlot: true,
    });
  });

  it("advances slot after save when enabled", () => {
    const next = rememberGeoAfterSave({
      binder: "Trade",
      page: "12",
      slot: "4",
      advanceSlot: true,
    });
    expect(next).toEqual({
      binder: "Trade",
      page: "12",
      slot: "5",
      advanceSlot: true,
    });
    expect(readGeoDefaults().slot).toBe("5");
  });

  it("keeps slot when advance is off", () => {
    writeGeoDefaults({
      binder: "Main",
      page: "1",
      slot: "2",
      advanceSlot: false,
    });
    const next = rememberGeoAfterSave({
      binder: "Main",
      page: "1",
      slot: "2",
      advanceSlot: false,
    });
    expect(next.slot).toBe("2");
  });
});
