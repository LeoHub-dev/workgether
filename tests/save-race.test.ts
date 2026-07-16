import { describe, expect, it } from "vitest";
import {
  contentFingerprint,
  plainTextLength,
  saveCompletionState,
  shouldIgnoreRemoteEcho,
} from "@/lib/sync-content";
import { textToLexicalState } from "@/lib/file-parse";

describe("saveCompletionState (stale autosave race)", () => {
  it("rejects completion from a superseded save id", () => {
    const oneChar = contentFingerprint(textToLexicalState("H"));
    const full = contentFingerprint(textToLexicalState("Hello"));
    const result = saveCompletionState({
      saveId: 1,
      latestSaveId: 3,
      savedFingerprint: oneChar,
      currentFingerprint: full,
    });
    expect(result.isLatest).toBe(false);
    expect(result.stillDirty).toBe(true);
  });

  it("keeps dirty when user typed during the in-flight save", () => {
    const oneChar = contentFingerprint(textToLexicalState("H"));
    const full = contentFingerprint(textToLexicalState("Hello"));
    const result = saveCompletionState({
      saveId: 2,
      latestSaveId: 2,
      savedFingerprint: oneChar,
      currentFingerprint: full,
    });
    expect(result.isLatest).toBe(true);
    expect(result.stillDirty).toBe(true);
  });

  it("marks clean only when saved snapshot matches current editor", () => {
    const full = contentFingerprint(textToLexicalState("Hello"));
    const result = saveCompletionState({
      saveId: 5,
      latestSaveId: 5,
      savedFingerprint: full,
      currentFingerprint: full,
    });
    expect(result.isLatest).toBe(true);
    expect(result.stillDirty).toBe(false);
  });
});

describe("plainTextLength (reload sanity)", () => {
  it("counts full text not just the first character", () => {
    expect(plainTextLength(textToLexicalState("a"))).toBe(1);
    expect(plainTextLength(textToLexicalState("abc"))).toBe(3);
  });
});

describe("shouldIgnoreRemoteEcho", () => {
  it("ignores echo of content we just saved", () => {
    const fp = contentFingerprint(textToLexicalState("H"));
    expect(
      shouldIgnoreRemoteEcho({
        remoteFingerprint: fp,
        localFingerprint: contentFingerprint(textToLexicalState("Hello")),
        recentLocalFingerprints: [fp],
      }),
    ).toBe(true);
  });

  it("ignores remote that already matches local editor", () => {
    const fp = contentFingerprint(textToLexicalState("Hello"));
    expect(
      shouldIgnoreRemoteEcho({
        remoteFingerprint: fp,
        localFingerprint: fp,
        recentLocalFingerprints: [],
      }),
    ).toBe(true);
  });

  it("allows genuine peer updates", () => {
    expect(
      shouldIgnoreRemoteEcho({
        remoteFingerprint: contentFingerprint(textToLexicalState("Peer")),
        localFingerprint: contentFingerprint(textToLexicalState("Mine")),
        recentLocalFingerprints: [
          contentFingerprint(textToLexicalState("Mine")),
        ],
      }),
    ).toBe(false);
  });
});
