import { describe, expect, it } from "vitest";
import {
  extensionOf,
  isContentImportFilename,
  parseContentFile,
  textToLexicalState,
  titleFromFilename,
} from "@/lib/file-parse";
import {
  plainTextFromLexicalState,
  serializeImportedContent,
  shouldConfirmReplace,
} from "@/lib/import-content";
import { ApiError } from "@/lib/errors";

describe("import filename / title helpers", () => {
  it("detects supported import extensions", () => {
    expect(isContentImportFilename("notes.txt")).toBe(true);
    expect(isContentImportFilename("README.MD")).toBe(true);
    expect(isContentImportFilename("brief.docx")).toBe(true);
    expect(isContentImportFilename("photo.png")).toBe(false);
    expect(isContentImportFilename("noext")).toBe(false);
  });

  it("derives title from filename", () => {
    expect(titleFromFilename("My Notes.txt")).toBe("My Notes");
    expect(titleFromFilename(".hidden")).toBe("Untitled");
    expect(extensionOf("doc.DOCX")).toBe(".docx");
  });
});

describe("textToLexicalState (edit/import file → Lexical)", () => {
  it("maps plain text lines to paragraphs", () => {
    const state = textToLexicalState("Hello\nWorld");
    expect(state.root.children).toHaveLength(2);
    expect(state.root.children[0]).toMatchObject({ type: "paragraph" });
    expect(
      (state.root.children[0] as { children: { text: string }[] }).children[0]
        .text,
    ).toBe("Hello");
    expect(
      (state.root.children[1] as { children: { text: string }[] }).children[0]
        .text,
    ).toBe("World");
  });

  it("maps markdown headings", () => {
    const state = textToLexicalState("# Title\n## Sub\nBody");
    expect(state.root.children[0]).toMatchObject({
      type: "heading",
      tag: "h1",
    });
    expect(state.root.children[1]).toMatchObject({
      type: "heading",
      tag: "h2",
    });
    expect(state.root.children[2]).toMatchObject({ type: "paragraph" });
  });

  it("round-trips through plainTextFromLexicalState", () => {
    const source = "# Title\nHello";
    const state = textToLexicalState(source);
    expect(plainTextFromLexicalState(state)).toBe(source);
  });
});

describe("parseContentFile", () => {
  it("parses .txt into Lexical JSON", async () => {
    const parsed = await parseContentFile(
      Buffer.from("Line one\nLine two", "utf8"),
      "draft.txt",
    );
    expect(parsed.title).toBe("draft");
    expect(parsed.plainText).toContain("Line one");
    expect(parsed.content_json).toMatchObject({
      root: { type: "root" },
    });
    expect(plainTextFromLexicalState(parsed.content_json)).toBe(
      "Line one\nLine two",
    );
  });

  it("parses .md headings into Lexical heading nodes", async () => {
    const parsed = await parseContentFile(
      Buffer.from("# Hello\n\nParagraph", "utf8"),
      "readme.md",
    );
    expect(parsed.title).toBe("readme");
    const children = (
      parsed.content_json as {
        root: { children: Array<{ type: string; tag?: string }> };
      }
    ).root.children;
    expect(children[0]).toMatchObject({ type: "heading", tag: "h1" });
  });

  it("rejects unsupported extensions used for import", async () => {
    await expect(
      parseContentFile(Buffer.from("%PDF"), "file.pdf"),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe("editor import apply helpers", () => {
  it("asks for confirm only when document has content", () => {
    expect(shouldConfirmReplace("")).toBe(false);
    expect(shouldConfirmReplace("   ")).toBe(false);
    expect(shouldConfirmReplace("existing text")).toBe(true);
  });

  it("serializes imported Lexical JSON for parseEditorState", () => {
    const state = textToLexicalState("Imported");
    const serialized = serializeImportedContent(state);
    expect(JSON.parse(serialized).root.children[0].children[0].text).toBe(
      "Imported",
    );
  });

  it("rejects invalid imported payloads", () => {
    expect(() => serializeImportedContent(null)).toThrow(/empty/i);
    expect(() => serializeImportedContent({ foo: 1 })).toThrow(/valid Lexical/i);
  });
});
