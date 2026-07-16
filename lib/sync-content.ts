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
