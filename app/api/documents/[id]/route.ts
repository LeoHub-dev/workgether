import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/auth";
import { resolveDocumentAccess } from "@/lib/access";
import { ApiError, jsonError, jsonOk } from "@/lib/errors";
import { getServiceSupabase } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Unauthorized");
    const { id } = await params;

    const resolved = await resolveDocumentAccess(id, user.id);
    if (!resolved) throw new ApiError(404, "Document not found");

    const supabase = getServiceSupabase();
    const { data: attachments } = await supabase
      .from("attachments")
      .select("*")
      .eq("document_id", id)
      .order("created_at", { ascending: false });

    return jsonOk({
      document: resolved.document,
      access: resolved.access,
      canEdit: resolved.canEdit,
      canShare: resolved.canShare,
      attachments: attachments ?? [],
      user,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Unauthorized");
    const { id } = await params;

    const resolved = await resolveDocumentAccess(id, user.id);
    if (!resolved) throw new ApiError(404, "Document not found");
    if (!resolved.canEdit) throw new ApiError(403, "Viewers cannot edit this document");

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (typeof body.title === "string") {
      const title = body.title.trim().slice(0, 200);
      if (!title) throw new ApiError(400, "Title cannot be empty");
      updates.title = title;
    }
    if (body.content_json !== undefined) {
      updates.content_json = body.content_json;
    }
    if (typeof body.yjs_state === "string" || body.yjs_state === null) {
      updates.yjs_state = body.yjs_state;
    }

    if (Object.keys(updates).length === 0) {
      throw new ApiError(400, "No valid fields to update");
    }

    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("documents")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error || !data) {
      console.error(error);
      throw new ApiError(500, "Failed to save document");
    }

    // content_json is the source of truth on reload. Clear Yjs snapshots so an
    // older collaborative CRDT state (e.g. only the first character) cannot
    // overwrite the full document when the editor is reopened.
    if (body.content_json !== undefined) {
      // Delete both current room key and legacy `doc:` prefixed rows.
      const { error: yjsError } = await supabase
        .from("yjs_documents")
        .delete()
        .in("room", [id, `doc:${id}`]);
      if (yjsError) {
        console.error("Failed to clear yjs_documents after save", yjsError);
      }
      if (data.yjs_state) {
        await supabase
          .from("documents")
          .update({ yjs_state: null })
          .eq("id", id);
      }
    }

    // Invalidate App Router caches so the next open is not the empty first visit.
    revalidatePath(`/docs/${id}`);
    revalidatePath("/home");

    return jsonOk({ document: data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Unauthorized");
    const { id } = await params;

    const resolved = await resolveDocumentAccess(id, user.id);
    if (!resolved) throw new ApiError(404, "Document not found");
    if (resolved.access !== "owner") {
      throw new ApiError(403, "Only the owner can delete this document");
    }

    const supabase = getServiceSupabase();

    // Remove storage files best-effort
    const { data: attachments } = await supabase
      .from("attachments")
      .select("storage_path")
      .eq("document_id", id);
    if (attachments?.length) {
      await supabase.storage
        .from("attachments")
        .remove(attachments.map((a) => a.storage_path));
    }

    const { error } = await supabase.from("documents").delete().eq("id", id);
    if (error) {
      console.error(error);
      throw new ApiError(500, "Failed to delete document");
    }

    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
