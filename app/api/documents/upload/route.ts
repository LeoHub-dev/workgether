import { getSessionUser } from "@/lib/auth";
import { emptyLexicalState } from "@/lib/access";
import { ApiError, jsonCreated, jsonError } from "@/lib/errors";
import {
  isContentImportFilename,
  parseContentFile,
} from "@/lib/file-parse";
import { getServiceSupabase } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Unauthorized");

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ApiError(400, "Missing file");
    }

    if (!isContentImportFilename(file.name)) {
      throw new ApiError(
        400,
        "Unsupported type. Upload .txt, .md, or .docx to create a new document.",
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseContentFile(buffer, file.name);

    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("documents")
      .insert({
        title: parsed.title,
        owner_id: user.id,
        content_json: parsed.content_json ?? emptyLexicalState(),
      })
      .select("*")
      .single();

    if (error || !data) {
      console.error(error);
      throw new ApiError(500, "Failed to create document from upload");
    }

    return jsonCreated({ document: data });
  } catch (error) {
    return jsonError(error);
  }
}
