import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { HomeClient } from "@/components/HomeClient";
import type { DocumentListItem } from "@/lib/types";

async function fetchDocuments(): Promise<DocumentListItem[]> {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  // Prefer direct DB access on the server instead of self-HTTP
  try {
    const { getServiceSupabase } = await import("@/lib/supabase/server");
    const user = await getSessionUser();
    if (!user) return [];
    const supabase = getServiceSupabase();

    const { data: owned } = await supabase
      .from("documents")
      .select("id, title, updated_at, created_at")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false });

    const ownedItems: DocumentListItem[] = (owned ?? []).map((d) => ({
      id: d.id,
      title: d.title,
      updated_at: d.updated_at,
      created_at: d.created_at,
      badge: "owned",
      role: "owner",
    }));

    const { data: accessRows } = await supabase
      .from("document_access")
      .select("role, document_id")
      .eq("user_id", user.id);

    let sharedItems: DocumentListItem[] = [];
    if (accessRows?.length) {
      const ids = accessRows.map((r) => r.document_id);
      const { data: docs } = await supabase
        .from("documents")
        .select("id, title, updated_at, created_at, owner_id")
        .in("id", ids)
        .neq("owner_id", user.id);

      sharedItems = (docs ?? []).map((doc) => ({
        id: doc.id,
        title: doc.title,
        updated_at: doc.updated_at,
        created_at: doc.created_at,
        badge: "shared" as const,
        role: (accessRows.find((a) => a.document_id === doc.id)?.role ||
          "viewer") as "viewer" | "editor",
      }));
    }

    return [...ownedItems, ...sharedItems];
  } catch (e) {
    console.error("home fetchDocuments", e, base);
    return [];
  }
}

export default async function HomePage() {
  const user = await getSessionUser().catch(() => null);
  if (!user) redirect("/");

  const documents = await fetchDocuments();

  return <HomeClient username={user.username} initialDocuments={documents} />;
}
