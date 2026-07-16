import { getSessionUser } from "@/lib/auth";
import { grantShareAccess } from "@/lib/access";
import { ApiError, jsonError, jsonOk } from "@/lib/errors";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { DocumentRow } from "@/lib/types";

type Params = { params: Promise<{ token: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await getSessionUser();
    if (!user) throw new ApiError(401, "Unauthorized");
    const { token } = await params;

    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("documents")
      .select("*")
      .eq("share_token", token)
      .maybeSingle();

    if (error) {
      console.error(error);
      throw new ApiError(500, "Failed to resolve share link");
    }
    if (!data || !data.share_role) {
      throw new ApiError(404, "Share link is invalid or disabled");
    }

    const document = data as DocumentRow;
    const role = await grantShareAccess(document, user.id);
    if (!role) throw new ApiError(500, "Could not grant access");

    return jsonOk({
      documentId: document.id,
      role,
      title: document.title,
    });
  } catch (error) {
    return jsonError(error);
  }
}
