import type { CollectionEntry, CollectionSummary } from "./types";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { markBackupCompleted } from "./backupMeta";
import { APP_VERSION } from "./version";

export interface CollectionBackup {
  version: 3;
  app: "archive-binder";
  appVersion: string;
  exportedAt: string;
  entries: CollectionEntry[];
}

export function buildCollectionBackup(
  collection: CollectionSummary,
): CollectionBackup {
  return {
    version: 3,
    app: "archive-binder",
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    entries: collection.entries,
  };
}

export function parseCollectionBackup(raw: string): CollectionEntry[] {
  const parsed = JSON.parse(raw) as Partial<CollectionBackup> | CollectionEntry[];
  const entries = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.entries)
      ? parsed.entries
      : null;
  if (!entries) {
    throw new Error("Backup file is missing collection entries");
  }
  return entries;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Save/share a JSON backup of the full binder. */
export async function shareCollectionBackup(
  collection: CollectionSummary,
): Promise<string> {
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `archive-binder-backup-${stamp}.json`;
  const json = `${JSON.stringify(buildCollectionBackup(collection), null, 2)}\n`;
  const blob = new Blob([json], { type: "application/json" });

  if (Capacitor.isNativePlatform()) {
    const data = await blobToBase64(blob);
    const path = `ArchiveBinder/${filename}`;
    await Filesystem.writeFile({
      path,
      data,
      directory: Directory.Documents,
      recursive: true,
    });
    const uri = await Filesystem.getUri({
      path,
      directory: Directory.Documents,
    });
    try {
      await Share.share({
        title: "Archive Binder backup",
        text: `Archive Binder backup v${APP_VERSION}`,
        files: [uri.uri],
        dialogTitle: "Share collection backup",
      });
    } catch (err) {
      if (err instanceof Error && /cancel|abort/i.test(err.message)) {
        throw new DOMException("Share cancelled", "AbortError");
      }
    }
    markBackupCompleted();
    return `Documents/ArchiveBinder/${filename}`;
  }

  downloadBlob(blob, filename);
  markBackupCompleted();
  return filename;
}

export function pickBackupFile(): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new DOMException("No file selected", "AbortError"));
        return;
      }
      try {
        resolve(await file.text());
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Could not read backup"));
      }
    };
    input.click();
  });
}
