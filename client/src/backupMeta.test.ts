import { describe, expect, it } from "vitest";
import {
  backupReminderMessage,
  formatBackupAge,
} from "./backupMeta";

describe("backupMeta", () => {
  it("reminds when never backed up", () => {
    expect(backupReminderMessage({ lastBackupAt: null })).toMatch(/No backup/);
  });

  it("reminds when backup is stale", () => {
    const eightDaysAgo = new Date(
      Date.now() - 8 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(
      backupReminderMessage({ lastBackupAt: eightDaysAgo }),
    ).toMatch(/Last backup/);
  });

  it("formats recent backup age", () => {
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    expect(formatBackupAge({ lastBackupAt: tenMinAgo })).toBe(
      "Backed up 10m ago",
    );
  });
});
