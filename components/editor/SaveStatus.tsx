"use client";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export function SaveStatus({ state, error }: { state: SaveState; error?: string | null }) {
  const label =
    state === "saving"
      ? "Saving…"
      : state === "saved"
        ? "Saved"
        : state === "dirty"
          ? "Unsaved changes"
          : state === "error"
            ? error || "Save failed"
            : "Ready";

  const color =
    state === "error"
      ? "text-rose-700"
      : state === "saved"
        ? "text-teal-800"
        : state === "saving"
          ? "text-amber-700"
          : "text-stone-500";

  return <span className={`text-sm ${color}`}>{label}</span>;
}
