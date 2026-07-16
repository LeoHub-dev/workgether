"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function SharePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function openShare() {
      try {
        const res = await fetch(`/api/share/${params.token}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Invalid share link");
        if (!cancelled) router.replace(`/docs/${data.documentId}`);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not open share link");
        }
      }
    }
    void openShare();
    return () => {
      cancelled = true;
    };
  }, [params.token, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f3efe6] px-4">
      <div className="max-w-md text-center">
        <h1 className="font-serif text-3xl text-teal-950">Workgether</h1>
        {error ? (
          <p className="mt-4 text-rose-700">{error}</p>
        ) : (
          <p className="mt-4 text-stone-600">Opening shared document…</p>
        )}
      </div>
    </div>
  );
}
