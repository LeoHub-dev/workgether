import { randomUUID } from "crypto";
import { getSessionUser } from "@/lib/auth";
import { resolveDocumentAccess } from "@/lib/access";
import { ApiError, jsonCreated, jsonError, jsonOk } from "@/lib/errors";
import {
  extensionOf,
  isAttachmentFilename,
  mimeFromFilename,
} from "@/lib/file-parse";
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
    const { data, error } = await supabase
      .from("attachments")
      .select("*")
      .eq("document_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      throw new ApiError(500, "Failed to list attachments");
    }

    const withUrls = await Promise.all(
      (data ?? []).map(async (row) => {
        const { data: signed } = await supabase.storage
          .from("attachments")
          .createSignedUrl(row.storage_path, 60 * 60);
        return { ...row, url: signed?.signedUrl ?? null };
      }),
    );

    return jsonOk({ attachments: withUrls });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Unauthorized");
    const { id } = await params;

    const resolved = await resolveDocumentAccess(id, user.id);
    if (!resolved) throw new ApiError(404, "Document not found");
    if (!resolved.canEdit) {
      throw new ApiError(403, "Viewers cannot attach files");
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Missing file");

    if (!isAttachmentFilename(file.name)) {
      throw new ApiError(
        400,
        "Unsupported attachment. Allowed: png, jpg, webp, gif, pdf.",
      );
    }

    const ext = extensionOf(file.name);
    const mime = file.type || mimeFromFilename(file.name);
    const storage_path = `${id}/${randomUUID()}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const supabase = getServiceSupabase();
    const { error: uploadError } = await supabase.storage
      .from("attachments")
      .upload(storage_path, buffer, {
        contentType: mime,
        upsert: false,
      });

    if (uploadError) {
      console.error(uploadError);
      throw new ApiError(500, "Failed to upload file to storage");
    }

    const { data, error } = await supabase
      .from("attachments")
      .insert({
        document_id: id,
        filename: file.name,
        mime_type: mime,
        storage_path,
        uploaded_by: user.id,
      })
      .select("*")
      .single();

    if (error || !data) {
      console.error(error);
      throw new ApiError(500, "Failed to save attachment metadata");
    }

    const { data: signed } = await supabase.storage
      .from("attachments")
      .createSignedUrl(storage_path, 60 * 60);

    return jsonCreated({ attachment: { ...data, url: signed?.signedUrl ?? null } });
  } catch (error) {
    return jsonError(error);
  }
}
