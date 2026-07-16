/**
 * Helpers for soft-sync / broadcast content merge decisions.
 * Ensures formatting-only edits (e.g. bold) are not dropped when peers race.
 */

export type ContentEnvelope = {
  content_json: unknown;
  /** ISO timestamp or epoch ms from the sender / server */
  updated_at: string | number;
  /** Optional monotonic revision from the sender */
  rev?: number;
};

export function toEpochMs(value: string | number | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Apply remote content when it is strictly newer than what we last applied,
 * unless the local user has unsaved edits that are newer than the remote.
 */
export function shouldApplyRemoteContent(options: {
  remoteUpdatedAt: string | number;
  lastAppliedRemoteAt: string | number;
  localDirty: boolean;
  localEditAt: string | number;
}): boolean {
  const remoteMs = toEpochMs(options.remoteUpdatedAt);
  const appliedMs = toEpochMs(options.lastAppliedRemoteAt);
  const localEditMs = toEpochMs(options.localEditAt);

  if (remoteMs <= appliedMs) return false;
  if (options.localDirty && localEditMs >= remoteMs) return false;
  return true;
}

/** Stable fingerprint so we can skip no-op applies (incl. format-only diffs). */
export function contentFingerprint(contentJson: unknown): string {
  try {
    return JSON.stringify(contentJson ?? null);
  } catch {
    return "";
  }
}

/**
 * Walk Lexical JSON and collect text format flags (for tests / debugging).
 * Bit 1 = bold, 2 = italic, 8 = underline (Lexical TextFormatType).
 */
export function collectTextFormats(contentJson: unknown): number[] {
  const formats: number[] = [];
  const root = (contentJson as { root?: { children?: unknown[] } } | null)?.root;
  if (!root?.children) return formats;

  const walk = (nodes: unknown[]) => {
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const n = node as {
        type?: string;
        format?: number;
        children?: unknown[];
      };
      if (n.type === "text" && typeof n.format === "number") {
        formats.push(n.format);
      }
      if (Array.isArray(n.children)) walk(n.children);
    }
  };
  walk(root.children);
  return formats;
}

export function hasBoldFormat(contentJson: unknown): boolean {
  return collectTextFormats(contentJson).some((f) => (f & 1) === 1);
}

/**
 * After a save response returns, only treat the doc as clean if the saved
 * snapshot still matches what the user has now. If they typed during the
 * request, we must keep dirty and flush again (avoids "Saved" with 1 char).
 */
export function saveCompletionState(options: {
  /** Monotonic id assigned when this save started */
  saveId: number;
  /** Latest save id (increments on every persist kickoff) */
  latestSaveId: number;
  savedFingerprint: string;
  currentFingerprint: string;
}): { isLatest: boolean; stillDirty: boolean } {
  const isLatest = options.saveId === options.latestSaveId;
  if (!isLatest) {
    return { isLatest: false, stillDirty: true };
  }
  return {
    isLatest: true,
    stillDirty: options.savedFingerprint !== options.currentFingerprint,
  };
}

/** Ignore Realtime echoes of content we ourselves just wrote/broadcast. */
export function shouldIgnoreRemoteEcho(options: {
  remoteFingerprint: string;
  localFingerprint: string;
  recentLocalFingerprints: Iterable<string>;
}): boolean {
  if (!options.remoteFingerprint) return true;
  if (options.remoteFingerprint === options.localFingerprint) return true;
  for (const fp of options.recentLocalFingerprints) {
    if (fp === options.remoteFingerprint) return true;
  }
  return false;
}

/** Best-effort plain text length from Lexical JSON (for reload comparisons). */
export function plainTextLength(contentJson: unknown): number {
  try {
    const root = (contentJson as { root?: { children?: unknown[] } } | null)
      ?.root;
    if (!root?.children) return 0;
    let len = 0;
    const walk = (nodes: unknown[]) => {
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        const n = node as { type?: string; text?: string; children?: unknown[] };
        if (typeof n.text === "string") len += n.text.length;
        if (Array.isArray(n.children)) walk(n.children);
      }
    };
    walk(root.children);
    return len;
  } catch {
    return 0;
  }
}
