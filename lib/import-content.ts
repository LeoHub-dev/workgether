/**
 * Pure helpers for the editor "Import content" / file-edit flow.
 * Kept free of React so they can be unit tested.
 */

/** True when the open document already has text and import should confirm replace. */
export function shouldConfirmReplace(currentPlainText: string): boolean {
  return currentPlainText.trim().length > 0;
}

/** Serialize Lexical JSON for `editor.parseEditorState`. */
export function serializeImportedContent(contentJson: unknown): string {
  if (contentJson == null) {
    throw new Error("Imported content is empty");
  }
  if (typeof contentJson === "string") {
    // Already serialized — validate it parses as JSON object with a root
    const parsed = JSON.parse(contentJson) as { root?: unknown };
    if (!parsed || typeof parsed !== "object" || !parsed.root) {
      throw new Error("Imported content is not valid Lexical state");
    }
    return contentJson;
  }
  if (typeof contentJson !== "object" || !("root" in (contentJson as object))) {
    throw new Error("Imported content is not valid Lexical state");
  }
  return JSON.stringify(contentJson);
}

/** Extract readable plain text from a Lexical state JSON (best-effort for tests/UI). */
export function plainTextFromLexicalState(contentJson: unknown): string {
  const state =
    typeof contentJson === "string" ? JSON.parse(contentJson) : contentJson;
  if (!state || typeof state !== "object") return "";
  const root = (state as { root?: { children?: unknown[] } }).root;
  if (!root?.children?.length) return "";

  const parts: string[] = [];
  for (const node of root.children) {
    if (!node || typeof node !== "object") continue;
    const n = node as {
      type?: string;
      tag?: string;
      children?: Array<{ text?: string }>;
    };
    const text = (n.children ?? [])
      .map((c) => c?.text ?? "")
      .join("");
    if (n.type === "heading" && n.tag) {
      const level = Number(n.tag.replace("h", "")) || 1;
      parts.push(`${"#".repeat(level)} ${text}`);
    } else {
      parts.push(text);
    }
  }
  return parts.join("\n");
}
