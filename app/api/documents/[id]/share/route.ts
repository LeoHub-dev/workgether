import { randomBytes } from "crypto";
import { getSessionUser } from "@/lib/auth";
import { resolveDocumentAccess } from "@/lib/access";
import { ApiError, jsonError, jsonOk } from "@/lib/errors";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { ShareRole } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Unauthorized");
    const { id } = await params;

    const resolved = await resolveDocumentAccess(id, user.id);
    if (!resolved) throw new ApiError(404, "Document not found");
    if (!resolved.canShare) {
      throw new ApiError(403, "Only the owner can change sharing");
    }

    const body = await request.json().catch(() => ({}));
    const role = body.role as ShareRole | "off" | undefined;
    const regenerate = Boolean(body.regenerate);

    const supabase = getServiceSupabase();
    let share_token = resolved.document.share_token;
    let share_role = resolved.document.share_role;

    if (role === "off") {
      share_token = null;
      share_role = null;
    } else if (role === "viewer" || role === "editor") {
      share_role = role;
      if (!share_token || regenerate) {
        share_token = randomBytes(24).toString("base64url");
      }
    } else if (regenerate) {
      share_token = randomBytes(24).toString("base64url");
      if (!share_role) share_role = "viewer";
    } else {
      throw new ApiError(400, "Provide role: viewer, editor, or off");
    }

    const { data, error } = await supabase
      .from("documents")
      .update({ share_token, share_role })
      .eq("id", id)
      .select("id, share_token, share_role")
      .single();

    if (error || !data) {
      console.error(error);
      throw new ApiError(500, "Failed to update sharing");
    }

    return jsonOk({
      share_token: data.share_token,
      share_role: data.share_role,
      share_path: data.share_token ? `/share/${data.share_token}` : null,
    });
  } catch (error) {
    return jsonError(error);
  }
}
