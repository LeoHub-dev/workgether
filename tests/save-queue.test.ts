import { describe, expect, it } from "vitest";
import { SaveQueue } from "@/lib/save-queue";
import { shouldIgnoreEditorChange } from "@/lib/sync-content";
import { contentFingerprint } from "@/lib/sync-content";
import { emptyLexicalState } from "@/lib/access";
import { textToLexicalState } from "@/lib/file-parse";

describe("SaveQueue", () => {
  it("runs tasks strictly in order (no navigate-before-save race)", async () => {
    const q = new SaveQueue();
    const order: number[] = [];

    const first = q.run(async () => {
      await new Promise((r) => setTimeout(r, 40));
      order.push(1);
      return "empty-or-partial";
    });

    const second = q.run(async () => {
      order.push(2);
      return "full-abc";
    });

    const [a, b] = await Promise.all([first, second]);
    expect(order).toEqual([1, 2]);
    expect(a).toBe("empty-or-partial");
    expect(b).toBe("full-abc");
  });
});

describe("shouldIgnoreEditorChange (new document mount)", () => {
  it("ignores the initial empty OnChange before the user types", () => {
    const initial = contentFingerprint(emptyLexicalState());
    expect(
      shouldIgnoreEditorChange({
        userHasEdited: false,
        nextFingerprint: initial,
        initialFingerprint: initial,
      }),
    ).toBe(true);
  });

  it("does not ignore the first real edit on a new document", () => {
    const initial = contentFingerprint(emptyLexicalState());
    const typed = contentFingerprint(textToLexicalState("abc"));
    expect(
      shouldIgnoreEditorChange({
        userHasEdited: false,
        nextFingerprint: typed,
        initialFingerprint: initial,
      }),
    ).toBe(false);
  });
});
