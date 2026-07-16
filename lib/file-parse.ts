import mammoth from "mammoth";
import { ApiError } from "@/lib/errors";
import { emptyLexicalState } from "@/lib/access";

function textToLexicalState(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const children = lines.map((line) => {
    const trimmed = line.trimEnd();
    // Simple markdown heading detection for .md
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      const tag = `h${heading[1].length}` as "h1" | "h2" | "h3";
      return {
        children: heading[2]
          ? [
              {
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                text: heading[2],
                type: "text",
                version: 1,
              },
            ]
          : [],
        direction: null,
        format: "",
        indent: 0,
        type: "heading",
        tag,
        version: 1,
      };
    }

    return {
      children: trimmed
        ? [
            {
              detail: 0,
              format: 0,
              mode: "normal",
              style: "",
              text: trimmed,
              type: "text",
              version: 1,
            },
          ]
        : [],
      direction: null,
      format: "",
      indent: 0,
      type: "paragraph",
      version: 1,
    };
  });

  return {
    root: {
      children: children.length ? children : emptyLexicalState().root.children,
      direction: null,
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  };
}

export function extensionOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i >= 0 ? filename.slice(i).toLowerCase() : "";
}

export function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").trim();
  return base || "Untitled";
}

export async function parseContentFile(
  buffer: Buffer,
  filename: string,
): Promise<{ title: string; content_json: unknown; plainText: string }> {
  const ext = extensionOf(filename);
  const title = titleFromFilename(filename);

  if (ext === ".txt" || ext === ".md") {
    const plainText = buffer.toString("utf8");
    return { title, content_json: textToLexicalState(plainText), plainText };
  }

  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ buffer });
    const plainText = result.value || "";
    return { title, content_json: textToLexicalState(plainText), plainText };
  }

  throw new ApiError(
    400,
    `Unsupported content type "${ext}". Use .txt, .md, or .docx.`,
  );
}

export function isContentImportFilename(filename: string): boolean {
  const ext = extensionOf(filename);
  return ext === ".txt" || ext === ".md" || ext === ".docx";
}

export function isAttachmentFilename(filename: string): boolean {
  const ext = extensionOf(filename);
  return [".png", ".jpg", ".jpeg", ".webp", ".gif", ".pdf"].includes(ext);
}

export function mimeFromFilename(filename: string): string {
  const ext = extensionOf(filename);
  const map: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return map[ext] || "application/octet-stream";
}
