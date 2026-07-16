import { getSessionUser } from "@/lib/auth";
import { ApiError, jsonCreated, jsonError, jsonOk } from "@/lib/errors";
import { emptyLexicalState } from "@/lib/access";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { DocumentListItem } from "@/lib/types";

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Unauthorized");

    const supabase = getServiceSupabase();

    const { data: owned, error: ownedError } = await supabase
      .from("documents")
      .select("id, title, updated_at, created_at")
      .eq("owner_id", user.id)
      .order("updated_at", { ascending: false });

    if (ownedError) {
      console.error(ownedError);
      throw new ApiError(500, "Failed to list documents");
    }

    const ownedItems: DocumentListItem[] = (owned ?? []).map((d) => ({
      id: d.id,
      title: d.title,
      updated_at: d.updated_at,
      created_at: d.created_at,
      badge: "owned" as const,
      role: "owner" as const,
    }));

    const { data: accessRows, error: accessError } = await supabase
      .from("document_access")
      .select("role, document_id")
      .eq("user_id", user.id);

    if (accessError) {
      console.error(accessError);
      throw new ApiError(500, "Failed to list shared documents");
    }

    const shared: DocumentListItem[] = [];
    if (accessRows?.length) {
      const ids = accessRows.map((r) => r.document_id);
      const { data: docs, error: docsError } = await supabase
        .from("documents")
        .select("id, title, updated_at, created_at, owner_id")
        .in("id", ids)
        .neq("owner_id", user.id);

      if (docsError) {
        console.error(docsError);
        throw new ApiError(500, "Failed to load shared documents");
      }

      for (const doc of docs ?? []) {
        const role = accessRows.find((a) => a.document_id === doc.id)?.role;
        if (!role) continue;
        shared.push({
          id: doc.id,
          title: doc.title,
          updated_at: doc.updated_at,
          created_at: doc.created_at,
          badge: "shared",
          role: role as "viewer" | "editor",
        });
      }
    }

    return jsonOk({ documents: [...ownedItems, ...shared] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Unauthorized");

    const body = await request.json().catch(() => ({}));
    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim().slice(0, 200)
        : "Untitled";
    const content_json = body.content_json ?? emptyLexicalState();

    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("documents")
      .insert({
        title,
        owner_id: user.id,
        content_json,
      })
      .select("*")
      .single();

    if (error || !data) {
      console.error(error);
      throw new ApiError(500, "Failed to create document");
    }

    return jsonCreated({ document: data });
  } catch (error) {
    return jsonError(error);
  }
}
