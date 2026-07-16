"use client";

import { useState } from "react";
import type { ShareRole } from "@/lib/types";

type Props = {
  documentId: string;
  canShare: boolean;
  initialToken: string | null;
  initialRole: ShareRole | null;
  open: boolean;
  onClose: () => void;
};

export function ShareDialog({
  documentId,
  canShare,
  initialToken,
  initialRole,
  open,
  onClose,
}: Props) {
  const [token, setToken] = useState(initialToken);
  const [role, setRole] = useState<ShareRole | "off">(initialRole ?? "off");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const shareUrl =
    typeof window !== "undefined" && token
      ? `${window.location.origin}/share/${token}`
      : token
        ? `/share/${token}`
        : null;

  async function updateShare(nextRole: ShareRole | "off", regenerate = false) {
    if (!canShare) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: nextRole, regenerate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update sharing");
      setToken(data.share_token);
      setRole((data.share_role as ShareRole) ?? "off");
      setMessage(nextRole === "off" ? "Sharing disabled" : "Share settings saved");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-xl text-stone-900">Share document</h2>
            <p className="mt-1 text-sm text-stone-500">
              Anyone with the link can open it after logging in.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {!canShare ? (
          <p className="text-sm text-stone-600">
            Only the owner can change share settings. Your role:{" "}
            <strong>{initialRole ?? "viewer"}</strong>
          </p>
        ) : (
          <>
            <label className="mb-1 block text-sm font-medium text-stone-700">
              Access level
            </label>
            <select
              className="mb-3 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
              value={role}
              disabled={busy}
              onChange={(e) => {
                const v = e.target.value as ShareRole | "off";
                setRole(v);
                void updateShare(v);
              }}
            >
              <option value="off">Off — link disabled</option>
              <option value="viewer">Viewer — can read</option>
              <option value="editor">Editor — can edit</option>
            </select>

            {shareUrl && (
              <div className="mb-3">
                <label className="mb-1 block text-sm font-medium text-stone-700">
                  Share link
                </label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={shareUrl}
                    className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-stone-50 px-3 py-2 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => void copyLink()}
                    className="rounded-lg bg-teal-800 px-3 py-2 text-sm font-medium text-white hover:bg-teal-900"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void updateShare(role === "off" ? "viewer" : role, true)}
                  className="mt-2 text-xs text-stone-500 underline hover:text-stone-800"
                >
                  Regenerate link
                </button>
              </div>
            )}
          </>
        )}

        {message && <p className="mt-2 text-sm text-teal-800">{message}</p>}
      </div>
    </div>
  );
}
