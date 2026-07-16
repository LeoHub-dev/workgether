"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { CollaborationPlugin } from "@lexical/react/LexicalCollaborationPlugin";
import { LexicalCollaboration } from "@lexical/react/LexicalCollaborationContext";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import {
  $getRoot,
  $createParagraphNode,
  $createTextNode,
  type EditorState,
  type LexicalEditor,
} from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import Link from "next/link";
import { Toolbar } from "@/components/editor/Toolbar";
import { ShareDialog } from "@/components/editor/ShareDialog";
import { AttachmentsPanel } from "@/components/editor/AttachmentsPanel";
import { PresenceAvatars } from "@/components/editor/PresenceAvatars";
import { SaveStatus, type SaveState } from "@/components/editor/SaveStatus";
import { colorForUsername } from "@/lib/colors";
import {
  createSupabaseYjsProvider,
  getCollabMode,
} from "@/lib/collab/createSupabaseProvider";
import type { AttachmentRow, DocumentRow, SessionUser, ShareRole } from "@/lib/types";
import { getBrowserSupabase } from "@/lib/supabase/client";

type Props = {
  document: DocumentRow;
  user: SessionUser;
  access: "owner" | ShareRole;
  canEdit: boolean;
  canShare: boolean;
  attachments: AttachmentRow[];
};

function EditableGate({ canEdit }: { canEdit: boolean }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.setEditable(canEdit);
  }, [editor, canEdit]);
  return null;
}

function SoftSyncPlugin({
  documentId,
  canEdit,
  onRemoteContent,
}: {
  documentId: string;
  canEdit: boolean;
  onRemoteContent: (content: unknown) => void;
}) {
  useEffect(() => {
    if (getCollabMode() === "yjs") return;
    let channel: ReturnType<ReturnType<typeof getBrowserSupabase>["channel"]> | null =
      null;
    try {
      const supabase = getBrowserSupabase();
      channel = supabase
        .channel(`soft:doc:${documentId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "documents",
            filter: `id=eq.${documentId}`,
          },
          (payload) => {
            const row = payload.new as DocumentRow;
            if (!row?.content_json) return;
            onRemoteContent(row.content_json);
          },
        )
        .subscribe();
    } catch {
      // Soft sync unavailable without Supabase
    }
    return () => {
      if (channel) void getBrowserSupabase().removeChannel(channel);
    };
  }, [documentId, onRemoteContent]);

  void canEdit;
  return null;
}

export function DocumentEditor({
  document: initialDoc,
  user,
  access,
  canEdit,
  canShare,
  attachments: initialAttachments,
}: Props) {
  const [title, setTitle] = useState(initialDoc.title);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [collabMode] = useState(() => getCollabMode());
  const editorRef = useRef<LexicalEditor | null>(null);
  const latestJson = useRef<unknown>(initialDoc.content_json);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextChange = useRef(false);

  const cursorColor = useMemo(() => colorForUsername(user.username), [user.username]);

  const initialConfig = useMemo(
    () => ({
      namespace: `workgether-${initialDoc.id}`,
      editable: canEdit,
      editorState:
        collabMode === "yjs"
          ? null
          : initialDoc.content_json
            ? JSON.stringify(initialDoc.content_json)
            : undefined,
      theme: {
        paragraph: "mb-2",
        heading: {
          h1: "mb-3 text-3xl font-serif font-semibold text-stone-900",
          h2: "mb-2 text-2xl font-serif font-semibold text-stone-900",
          h3: "mb-2 text-xl font-serif font-semibold text-stone-900",
        },
        list: {
          ul: "mb-2 list-disc pl-6",
          ol: "mb-2 list-decimal pl-6",
          listitem: "mb-1",
        },
        text: {
          bold: "font-bold",
          italic: "italic",
          underline: "underline",
        },
      },
      nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode],
      onError(error: Error) {
        console.error(error);
      },
    }),
    [canEdit, collabMode, initialDoc.content_json, initialDoc.id],
  );

  const persist = useCallback(
    async (payload: { title?: string; content_json?: unknown }) => {
      if (!canEdit) return;
      setSaveState("saving");
      setSaveError(null);
      try {
        const res = await fetch(`/api/documents/${initialDoc.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Save failed");
        setSaveState("saved");
      } catch (e) {
        setSaveState("error");
        setSaveError(e instanceof Error ? e.message : "Save failed");
      }
    },
    [canEdit, initialDoc.id],
  );

  const scheduleContentSave = useCallback(() => {
    if (!canEdit) return;
    setSaveState("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persist({ content_json: latestJson.current });
    }, 1500);
  }, [canEdit, persist]);

  const scheduleTitleSave = useCallback(
    (nextTitle: string) => {
      if (!canEdit) return;
      setSaveState("dirty");
      if (titleTimer.current) clearTimeout(titleTimer.current);
      titleTimer.current = setTimeout(() => {
        void persist({ title: nextTitle });
      }, 800);
    },
    [canEdit, persist],
  );

  const handleChange = useCallback(
    (editorState: EditorState, editor: LexicalEditor) => {
      editorRef.current = editor;
      if (skipNextChange.current) {
        skipNextChange.current = false;
        return;
      }
      latestJson.current = editorState.toJSON();
      scheduleContentSave();
    },
    [scheduleContentSave],
  );

  const manualSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    void persist({ title, content_json: latestJson.current });
  }, [persist, title]);

  const providerFactory = useCallback(
    (id: string, yjsDocMap: Map<string, import("yjs").Doc>) =>
      createSupabaseYjsProvider(id, yjsDocMap, {
        username: user.username,
        color: cursorColor,
        canEdit,
      }),
    [canEdit, cursorColor, user.username],
  );

  const handleImport = useCallback(
    async (file: File) => {
      const editor = editorRef.current;
      const isEmpty = (() => {
        if (!editor) return true;
        let empty = true;
        editor.getEditorState().read(() => {
          const text = $getRoot().getTextContent().trim();
          empty = text.length === 0;
        });
        return empty;
      })();

      if (!isEmpty) {
        const ok = window.confirm(
          "This document has content. Importing will replace it. Continue?",
        );
        if (!ok) return;
      }

      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/documents/${initialDoc.id}/import`, {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");

      latestJson.current = data.content_json;
      skipNextChange.current = true;
      editor?.setEditorState(editor.parseEditorState(JSON.stringify(data.content_json)));
      setSaveState("saved");
    },
    [initialDoc.id],
  );

  const onRemoteContent = useCallback(
    (content: unknown) => {
      const editor = editorRef.current;
      if (!editor) return;
      // Only apply if local not dirty
      if (saveState === "dirty" || saveState === "saving") return;
      skipNextChange.current = true;
      latestJson.current = content;
      editor.setEditorState(editor.parseEditorState(JSON.stringify(content)));
    },
    [saveState],
  );

  const editorBody = (
    <>
      <Toolbar canEdit={canEdit} />
      <div className="relative min-h-[60vh] flex-1 px-6 py-6 md:px-12">
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className="min-h-[50vh] outline-none font-serif text-lg leading-relaxed text-stone-900"
              aria-placeholder="Start writing…"
              placeholder={
                <div className="pointer-events-none absolute left-6 top-6 font-serif text-lg text-stone-400 md:left-12">
                  Start writing…
                </div>
              }
            />
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        {collabMode === "yjs" ? (
          <CollaborationPlugin
            id={initialDoc.id}
            providerFactory={providerFactory}
            shouldBootstrap={true}
            username={user.username}
            cursorColor={cursorColor}
            initialEditorState={(editor) => {
              const state = initialDoc.content_json;
              if (!state || Object.keys(state as object).length === 0) {
                editor.update(() => {
                  const root = $getRoot();
                  if (root.getFirstChild() === null) {
                    const p = $createParagraphNode();
                    p.append($createTextNode(""));
                    root.append(p);
                  }
                });
                return;
              }
              const parsed = editor.parseEditorState(JSON.stringify(state));
              editor.setEditorState(parsed);
            }}
          />
        ) : (
          <HistoryPlugin />
        )}
        <ListPlugin />
        <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
        <EditableGate canEdit={canEdit} />
        <SoftSyncPlugin
          documentId={initialDoc.id}
          canEdit={canEdit}
          onRemoteContent={onRemoteContent}
        />
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#f3efe6]">
      <header className="sticky top-0 z-20 border-b border-stone-200/80 bg-[#f7f4ef]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link
            href="/home"
            className="font-serif text-lg font-semibold tracking-tight text-teal-900"
          >
            Workgether
          </Link>
          <input
            value={title}
            disabled={!canEdit}
            onChange={(e) => {
              setTitle(e.target.value);
              scheduleTitleSave(e.target.value);
            }}
            className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 font-serif text-lg text-stone-900 outline-none hover:border-stone-300 focus:border-teal-700 focus:bg-white disabled:opacity-70"
          />
          <PresenceAvatars documentId={initialDoc.id} user={user} />
          <SaveStatus state={saveState} error={saveError} />
          <span className="hidden rounded-full bg-stone-200 px-2 py-0.5 text-xs text-stone-600 sm:inline">
            {access}
          </span>
          <span className="hidden rounded-full bg-teal-100 px-2 py-0.5 text-xs text-teal-900 sm:inline">
            {collabMode === "yjs" ? "live" : "soft sync"}
          </span>
          {canEdit && (
            <button
              type="button"
              onClick={manualSave}
              className="rounded-lg bg-teal-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-900"
            >
              Save
            </button>
          )}
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-800 hover:bg-stone-50"
          >
            Share
          </button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col lg:flex-row">
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-none bg-white shadow-sm lg:my-4 lg:rounded-xl lg:border lg:border-stone-200">
          {collabMode === "yjs" ? (
            <LexicalCollaboration>
              <LexicalComposer initialConfig={initialConfig}>
                {editorBody}
              </LexicalComposer>
            </LexicalCollaboration>
          ) : (
            <LexicalComposer initialConfig={initialConfig}>
              {editorBody}
            </LexicalComposer>
          )}
        </main>
        <AttachmentsPanel
          documentId={initialDoc.id}
          canEdit={canEdit}
          initialAttachments={initialAttachments}
          onImportContent={handleImport}
        />
      </div>

      <ShareDialog
        documentId={initialDoc.id}
        canShare={canShare}
        initialToken={initialDoc.share_token}
        initialRole={initialDoc.share_role}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
      />
    </div>
  );
}
