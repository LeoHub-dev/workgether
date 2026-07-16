import { describe, expect, it } from "vitest";
import { textToLexicalState } from "@/lib/file-parse";
import {
  collectTextFormats,
  contentFingerprint,
  hasBoldFormat,
  shouldApplyRemoteContent,
  toEpochMs,
} from "@/lib/sync-content";

function withBold(text: string) {
  const state = textToLexicalState(text);
  const para = state.root.children[0] as {
    children: Array<{ format?: number; text?: string }>;
    textFormat?: number;
  };
  if (para.children[0]) {
    para.children[0].format = 1; // Lexical bold bit
  }
  para.textFormat = 1;
  return state;
}

describe("soft-sync apply decisions (format-safe)", () => {
  it("applies newer remote content when local is idle", () => {
    expect(
      shouldApplyRemoteContent({
        remoteUpdatedAt: "2026-07-16T12:00:02.000Z",
        lastAppliedRemoteAt: "2026-07-16T12:00:01.000Z",
        localDirty: false,
        localEditAt: 0,
      }),
    ).toBe(true);
  });

  it("skips stale remote content", () => {
    expect(
      shouldApplyRemoteContent({
        remoteUpdatedAt: "2026-07-16T12:00:01.000Z",
        lastAppliedRemoteAt: "2026-07-16T12:00:02.000Z",
        localDirty: false,
        localEditAt: 0,
      }),
    ).toBe(false);
  });

  it("does not drop remote bold when local dirty is older than remote", () => {
    const remoteMs = toEpochMs("2026-07-16T12:00:05.000Z");
    expect(
      shouldApplyRemoteContent({
        remoteUpdatedAt: remoteMs,
        lastAppliedRemoteAt: remoteMs - 2000,
        localDirty: true,
        localEditAt: remoteMs - 1000,
      }),
    ).toBe(true);
  });

  it("keeps local in-progress edits when they are newer than remote", () => {
    const remoteMs = toEpochMs("2026-07-16T12:00:05.000Z");
    expect(
      shouldApplyRemoteContent({
        remoteUpdatedAt: remoteMs,
        lastAppliedRemoteAt: remoteMs - 2000,
        localDirty: true,
        localEditAt: remoteMs + 500,
      }),
    ).toBe(false);
  });
});

describe("bold format preserved in Lexical JSON fingerprints", () => {
  it("detects bold bit in content_json", () => {
    const plain = textToLexicalState("Hello");
    const bold = withBold("Hello");
    expect(hasBoldFormat(plain)).toBe(false);
    expect(hasBoldFormat(bold)).toBe(true);
    expect(collectTextFormats(bold)).toContain(1);
  });

  it("fingerprints differ when only format changes", () => {
    const plain = textToLexicalState("Hello");
    const bold = withBold("Hello");
    expect(contentFingerprint(plain)).not.toBe(contentFingerprint(bold));
  });
});
