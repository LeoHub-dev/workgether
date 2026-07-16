import { redirect, notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { resolveDocumentAccess } from "@/lib/access";
import { DocumentEditor } from "@/components/editor/DocumentEditor";
import { getServiceSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Props = { params: Promise<{ id: string }> };

export default async function DocPage({ params }: Props) {
  const user = await getSessionUser().catch(() => null);
  if (!user) redirect("/");

  const { id } = await params;

  let resolved;
  try {
    resolved = await resolveDocumentAccess(id, user.id);
  } catch (e) {
    console.error(e);
    notFound();
  }

  if (!resolved) notFound();

  const supabase = getServiceSupabase();
  const { data: attachments } = await supabase
    .from("attachments")
    .select("*")
    .eq("document_id", id)
    .order("created_at", { ascending: false });

  const withUrls = await Promise.all(
    (attachments ?? []).map(async (row) => {
      const { data: signed } = await supabase.storage
        .from("attachments")
        .createSignedUrl(row.storage_path, 60 * 60);
      return { ...row, url: signed?.signedUrl ?? null };
    }),
  );

  return (
    <DocumentEditor
      document={resolved.document}
      user={user}
      access={resolved.access === "owner" ? "owner" : resolved.access}
      canEdit={resolved.canEdit}
      canShare={resolved.canShare}
      attachments={withUrls}
    />
  );
}
