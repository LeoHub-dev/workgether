"use client";

import { useRef, useState } from "react";
import type { AttachmentRow } from "@/lib/types";

type AttachmentWithUrl = AttachmentRow & { url?: string | null };

type Props = {
  documentId: string;
  canEdit: boolean;
  initialAttachments: AttachmentWithUrl[];
  onImportContent: (file: File) => Promise<void>;
};

export function AttachmentsPanel({
  documentId,
  canEdit,
  initialAttachments,
  onImportContent,
}: Props) {
  const [attachments, setAttachments] =
    useState<AttachmentWithUrl[]>(initialAttachments);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const attachRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  async function handleAttach(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/documents/${documentId}/attachments`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setAttachments((prev) => [data.attachment, ...prev]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(file: File) {
    setBusy(true);
    setError(null);
    try {
      await onImportContent(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="w-full border-t border-stone-200 bg-[#faf8f5] p-4 lg:w-72 lg:border-l lg:border-t-0">
      <h3 className="font-serif text-lg text-stone-900">Files</h3>
      <p className="mt-1 text-xs text-stone-500">
        Attach: png, jpg, webp, gif, pdf. Import content: txt, md, docx.
      </p>

      {canEdit && (
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => attachRef.current?.click()}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50"
          >
            Attach file
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => importRef.current?.click()}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-50"
          >
            Import content
          </button>
          <input
            ref={attachRef}
            type="file"
            className="hidden"
            accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,image/png,image/jpeg,image/webp,image/gif,application/pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void handleAttach(f);
            }}
          />
          <input
            ref={importRef}
            type="file"
            className="hidden"
            accept=".txt,.md,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void handleImport(f);
            }}
          />
        </div>
      )}

      {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}

      <ul className="mt-4 space-y-2">
        {attachments.length === 0 && (
          <li className="text-sm text-stone-400">No attachments yet</li>
        )}
        {attachments.map((a) => (
          <li key={a.id} className="text-sm">
            {a.url ? (
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="text-teal-800 underline-offset-2 hover:underline"
              >
                {a.filename}
              </a>
            ) : (
              <span className="text-stone-700">{a.filename}</span>
            )}
            <div className="text-xs text-stone-400">{a.mime_type}</div>
          </li>
        ))}
      </ul>
    </aside>
  );
}
