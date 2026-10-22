export const SHARE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

type CachedFile = { lastModified: number | null; delete: () => void };
type ShareFile = { uri: string; write: (content: string) => void };

/** Run only before a later export, never when the share chooser closes. */
export function cleanOldBackupShares(files: CachedFile[], now = Date.now()) {
  for (const file of files) {
    try {
      if (file.lastModified !== null && now - file.lastModified > SHARE_RETENTION_MS) file.delete();
    } catch { /* Cache cleanup must not prevent creating a new backup. */ }
  }
}

export async function shareBackupFile(file: ShareFile, json: string, share: (uri: string) => Promise<void>) {
  file.write(json);
  // Android resolves at chooser dismissal, before the receiver necessarily reads the URI.
  // Retain even on rejection: a share may already have handed out the URI.
  await share(file.uri);
}
