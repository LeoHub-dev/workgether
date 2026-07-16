import type { AccessLevel, DocumentRow, ShareRole } from "@/lib/types";
import { getServiceSupabase } from "@/lib/supabase/server";

export type ResolvedAccess = {
  document: DocumentRow;
  access: Exclude<AccessLevel, null>;
  canEdit: boolean;
  canShare: boolean;
};

export async function resolveDocumentAccess(
  documentId: string,
  userId: string,
): Promise<ResolvedAccess | null> {
  const supabase = getServiceSupabase();
  const { data: document, error } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .maybeSingle();

  if (error || !document) return null;

  const doc = document as DocumentRow;

  if (doc.owner_id === userId) {
    return {
      document: doc,
      access: "owner",
      canEdit: true,
      canShare: true,
    };
  }

  const { data: accessRow } = await supabase
    .from("document_access")
    .select("role")
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (accessRow?.role === "editor" || accessRow?.role === "viewer") {
    const role = accessRow.role as ShareRole;
    return {
      document: doc,
      access: role,
      canEdit: role === "editor",
      canShare: false,
    };
  }

  // Valid share link still grants access even before document_access row exists
  // (caller may grant it). Without a row or ownership → deny.
  return null;
}

export function canEditWithRole(access: AccessLevel): boolean {
  return access === "owner" || access === "editor";
}

export async function grantShareAccess(
  document: DocumentRow,
  userId: string,
): Promise<ShareRole | null> {
  if (!document.share_token || !document.share_role) return null;
  if (document.owner_id === userId) return "editor";

  const supabase = getServiceSupabase();
  const { error } = await supabase.from("document_access").upsert(
    {
      document_id: document.id,
      user_id: userId,
      role: document.share_role,
      opened_at: new Date().toISOString(),
    },
    { onConflict: "document_id,user_id" },
  );

  if (error) {
    console.error("grantShareAccess", error);
    return null;
  }
  return document.share_role;
}

/** Empty Lexical editor state root */
export function emptyLexicalState() {
  return {
    root: {
      children: [
        {
          children: [],
          direction: null,
          format: "",
          indent: 0,
          type: "paragraph",
          version: 1,
        },
      ],
      direction: null,
      format: "",
      indent: 0,
      type: "root",
      version: 1,
    },
  };
}
