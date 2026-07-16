"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { DocumentListItem } from "@/lib/types";

type Props = {
  username: string;
  initialDocuments: DocumentListItem[];
};

export function HomeClient({ username, initialDocuments }: Props) {
  const router = useRouter();
  const [documents, setDocuments] = useState(initialDocuments);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);

  const owned = documents.filter((d) => d.badge === "owned");
  const shared = documents.filter((d) => d.badge === "shared");

  async function createDoc() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create document");
      router.push(`/docs/${data.document.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setBusy(false);
    }
  }

  async function uploadAsNew(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/documents/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      router.push(`/docs/${data.document.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setBusy(false);
    }
  }

  async function rename(id: string, title: string) {
    const next = title.trim() || "Untitled";
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, title: next } : d)));
    const res = await fetch(`/api/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: next }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Rename failed");
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this document permanently?")) return;
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Delete failed");
      return;
    }
    setDocuments((prev) => prev.filter((d) => d.id !== id));
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  function openDoc(id: string) {
    // Bust client router/RSC cache from the empty "just created" visit.
    router.push(`/docs/${id}?t=${Date.now()}`);
    router.refresh();
  }

  function DocRow({ doc }: { doc: DocumentListItem }) {
    return (
      <li className="group flex items-center gap-3 border-b border-stone-200/80 py-3 last:border-0">
        <Link
          href={`/docs/${doc.id}`}
          prefetch={false}
          onClick={(e) => {
            e.preventDefault();
            openDoc(doc.id);
          }}
          className="min-w-0 flex-1 font-serif text-lg text-stone-900 hover:text-teal-900"
        >
          {doc.title}
        </Link>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            doc.badge === "owned"
              ? "bg-teal-100 text-teal-900"
              : "bg-amber-100 text-amber-900"
          }`}
        >
          {doc.badge === "owned" ? "Owned" : `Shared · ${doc.role}`}
        </span>
        <span className="hidden text-xs text-stone-400 sm:inline">
          {new Date(doc.updated_at).toLocaleString()}
        </span>
        {doc.badge === "owned" && (
          <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
            <button
              type="button"
              className="rounded px-2 py-1 text-xs text-stone-600 hover:bg-stone-100"
              onClick={() => {
                const next = window.prompt("Rename document", doc.title);
                if (next != null) void rename(doc.id, next);
              }}
            >
              Rename
            </button>
            <button
              type="button"
              className="rounded px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
              onClick={() => void remove(doc.id)}
            >
              Delete
            </button>
          </div>
        )}
      </li>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3efe6]">
      <header className="border-b border-stone-200/80 bg-[#f7f4ef]/95">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="font-serif text-2xl font-semibold tracking-tight text-teal-950">
              Workgether
            </h1>
            <p className="text-sm text-stone-500">Signed in as {username}</p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-8 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void createDoc()}
            className="rounded-lg bg-teal-800 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-900 disabled:opacity-60"
          >
            New document
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => uploadRef.current?.click()}
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-800 hover:bg-stone-50 disabled:opacity-60"
          >
            Upload as new (.txt / .md / .docx)
          </button>
          <input
            ref={uploadRef}
            type="file"
            className="hidden"
            accept=".txt,.md,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void uploadAsNew(f);
            }}
          />
        </div>

        {error && (
          <p className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
        )}

        <section className="mb-10">
          <h2 className="mb-2 font-serif text-xl text-stone-900">My documents</h2>
          <ul className="rounded-xl border border-stone-200 bg-white px-4">
            {owned.length === 0 && (
              <li className="py-6 text-sm text-stone-400">No documents yet — create one above.</li>
            )}
            {owned.map((doc) => (
              <DocRow key={doc.id} doc={doc} />
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-serif text-xl text-stone-900">Shared with me</h2>
          <ul className="rounded-xl border border-stone-200 bg-white px-4">
            {shared.length === 0 && (
              <li className="py-6 text-sm text-stone-400">
                Open a share link while logged in to see documents here.
              </li>
            )}
            {shared.map((doc) => (
              <DocRow key={doc.id} doc={doc} />
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
