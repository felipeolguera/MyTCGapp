import { describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => false,
  },
  CapacitorHttp: {
    get: vi.fn(),
  },
}));

import { tcgcsvBaseUrl } from "./corsFetch";

describe("tcgcsvBaseUrl", () => {
  it("uses the Vite proxy path in the browser", () => {
    expect(tcgcsvBaseUrl()).toBe("/tcgcsv");
  });
});
