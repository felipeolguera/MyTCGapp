const BACKUP_META_KEY = "archive-binder.backup-meta.v1";
/** Remind if last backup older than this many days (or never). */
export const BACKUP_REMINDER_DAYS = 7;

export interface BackupMeta {
  lastBackupAt: string | null;
}

export function readBackupMeta(): BackupMeta {
  try {
    const raw = localStorage.getItem(BACKUP_META_KEY);
    if (!raw) return { lastBackupAt: null };
    const parsed = JSON.parse(raw) as BackupMeta;
    return {
      lastBackupAt:
        typeof parsed.lastBackupAt === "string" ? parsed.lastBackupAt : null,
    };
  } catch {
    return { lastBackupAt: null };
  }
}

export function markBackupCompleted(at = new Date().toISOString()): BackupMeta {
  const meta = { lastBackupAt: at };
  localStorage.setItem(BACKUP_META_KEY, JSON.stringify(meta));
  return meta;
}

export function backupReminderMessage(
  meta: BackupMeta,
  now = Date.now(),
): string | null {
  if (!meta.lastBackupAt) {
    return "No backup yet — tap Backup to save your binder";
  }
  const then = Date.parse(meta.lastBackupAt);
  if (!Number.isFinite(then)) {
    return "No backup yet — tap Backup to save your binder";
  }
  const ageDays = (now - then) / (1000 * 60 * 60 * 24);
  if (ageDays >= BACKUP_REMINDER_DAYS) {
    const days = Math.floor(ageDays);
    return `Last backup ${days}d ago — consider backing up`;
  }
  return null;
}

export function formatBackupAge(meta: BackupMeta, now = Date.now()): string {
  if (!meta.lastBackupAt) return "Never backed up";
  const then = Date.parse(meta.lastBackupAt);
  if (!Number.isFinite(then)) return "Never backed up";
  const ageMs = Math.max(0, now - then);
  const mins = Math.floor(ageMs / 60000);
  if (mins < 1) return "Backed up just now";
  if (mins < 60) return `Backed up ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `Backed up ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Backed up ${days}d ago`;
}
