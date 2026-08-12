import { describe, expect, it } from "vitest";
import { marketTimesPercent, parseAskPercent } from "./sellPricing";

describe("sellPricing", () => {
  it("applies market × percent", () => {
    expect(marketTimesPercent(10, 90)).toBe(9);
    expect(marketTimesPercent(1.25, 80)).toBe(1);
    expect(marketTimesPercent(null, 90)).toBeNull();
  });

  it("parses percent input", () => {
    expect(parseAskPercent("90")).toBe(90);
    expect(parseAskPercent("90%")).toBe(90);
    expect(parseAskPercent("-1")).toBeNull();
  });
});
