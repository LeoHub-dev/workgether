import { getSessionUser } from "@/lib/auth";
import { resolveDocumentAccess } from "@/lib/access";
import { ApiError, jsonError, jsonOk } from "@/lib/errors";
import {
  isContentImportFilename,
  parseContentFile,
} from "@/lib/file-parse";
import { getServiceSupabase } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Unauthorized");
    const { id } = await params;

    const resolved = await resolveDocumentAccess(id, user.id);
    if (!resolved) throw new ApiError(404, "Document not found");
    if (!resolved.canEdit) {
      throw new ApiError(403, "Viewers cannot import content");
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "Missing file");

    if (!isContentImportFilename(file.name)) {
      throw new ApiError(
        400,
        "Unsupported type. Import .txt, .md, or .docx into the document.",
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseContentFile(buffer, file.name);

    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("documents")
      .update({ content_json: parsed.content_json })
      .eq("id", id)
      .select("*")
      .single();

    if (error || !data) {
      console.error(error);
      throw new ApiError(500, "Failed to import content");
    }

    return jsonOk({
      document: data,
      plainText: parsed.plainText,
      content_json: parsed.content_json,
    });
  } catch (error) {
    return jsonError(error);
  }
}
