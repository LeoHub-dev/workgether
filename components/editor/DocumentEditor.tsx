"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useRouter } from "next/navigation";
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
import {
  serializeImportedContent,
  shouldConfirmReplace,
} from "@/lib/import-content";
import {
  contentFingerprint,
  saveCompletionState,
  shouldApplyRemoteContent,
  shouldIgnoreRemoteEcho,
  toEpochMs,
} from "@/lib/sync-content";

type Props = {
  document: DocumentRow;
  user: SessionUser;
  access: "owner" | ShareRole;
  canEdit: boolean;
  canShare: boolean;
  attachments: AttachmentRow[];
};

type ContentBroadcast = {
  content_json: unknown;
  updated_at: string;
  sender_id: string;
  rev: number;
};

function EditableGate({ canEdit }: { canEdit: boolean }) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editor.setEditable(canEdit);
  }, [editor, canEdit]);
  return null;
}

/** Capture the Lexical editor instance as soon as the composer mounts. */
function EditorRefPlugin({
  editorRef,
}: {
  editorRef: MutableRefObject<LexicalEditor | null>;
}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    editorRef.current = editor;
  }, [editor, editorRef]);
  return null;
}

function SoftSyncPlugin({
  documentId,
  userId,
  onRemoteContent,
  publishRef,
}: {
  documentId: string;
  userId: string;
  onRemoteContent: (payload: {
    content_json: unknown;
    updated_at: string;
  }) => void;
  publishRef: MutableRefObject<
    ((content: unknown, updatedAt?: string) => void) | null
  >;
}) {
  useEffect(() => {
    if (getCollabMode() === "yjs") return;
    let channel: ReturnType<ReturnType<typeof getBrowserSupabase>["channel"]> | null =
      null;
    let rev = 0;
    try {
      const supabase = getBrowserSupabase();
      channel = supabase
        .channel(`soft:doc:${documentId}`, {
          config: { broadcast: { self: false } },
        })
        .on(
          "broadcast",
          { event: "content" },
          ({ payload }) => {
            const data = payload as ContentBroadcast;
            if (!data?.content_json || data.sender_id === userId) return;
            onRemoteContent({
              content_json: data.content_json,
              updated_at: data.updated_at,
            });
          },
        )
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
            onRemoteContent({
              content_json: row.content_json,
              updated_at: row.updated_at,
            });
          },
        )
        .subscribe();

      publishRef.current = (content, updatedAt) => {
        rev += 1;
        void channel?.send({
          type: "broadcast",
          event: "content",
          payload: {
            content_json: content,
            updated_at: updatedAt ?? new Date().toISOString(),
            sender_id: userId,
            rev,
          } satisfies ContentBroadcast,
        });
      };
    } catch {
      publishRef.current = null;
    }
    return () => {
      publishRef.current = null;
      if (channel) void getBrowserSupabase().removeChannel(channel);
    };
  }, [documentId, onRemoteContent, publishRef, userId]);

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
  const router = useRouter();
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
  const needsFlushRef = useRef(false);

  const cursorColor = useMemo(() => colorForUsername(user.username), [user.username]);

  /** Always read the live Lexical state at save time — never a stale ref alone. */
  const readLiveContent = useCallback((): unknown => {
    const editor = editorRef.current;
    if (editor) {
      const live = editor.getEditorState().toJSON();
      latestJson.current = live;
      return live;
    }
    return latestJson.current;
  }, []);

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
          bold: "editor-text-bold",
          italic: "editor-text-italic",
          underline: "editor-text-underline",
        },
      },
      nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode],
      onError(error: Error) {
        console.error(error);
      },
    }),
    [canEdit, collabMode, initialDoc.content_json, initialDoc.id],
  );

  const publishRef = useRef<((content: unknown, updatedAt?: string) => void) | null>(
    null,
  );
  const broadcastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localDirtyRef = useRef(false);
  const localEditAtRef = useRef(0);
  const lastAppliedRemoteAtRef = useRef(toEpochMs(initialDoc.updated_at));
  const lastFingerprintRef = useRef(contentFingerprint(initialDoc.content_json));
  const recentLocalFingerprints = useRef<string[]>([]);
  const saveInFlightRef = useRef(false);
  const latestSaveIdRef = useRef(0);
  const pendingTitleRef = useRef<string | null>(null);

  const rememberLocalFingerprint = useCallback((fp: string) => {
    const list = recentLocalFingerprints.current.filter((x) => x !== fp);
    list.push(fp);
    recentLocalFingerprints.current = list.slice(-12);
  }, []);

  const queueBroadcast = useCallback((content: unknown, updatedAt?: string) => {
    if (broadcastTimer.current) clearTimeout(broadcastTimer.current);
    broadcastTimer.current = setTimeout(() => {
      const fp = contentFingerprint(content);
      rememberLocalFingerprint(fp);
      publishRef.current?.(content, updatedAt);
    }, 120);
  }, [rememberLocalFingerprint]);

  /**
   * Coalescing save loop: always PATCH the *live* editor JSON, and if the user
   * typed while a request was in flight, flush again. Prevents "Saved" while
   * the DB still holds an older 1-character snapshot.
   */
  const flushSave = useCallback(async (): Promise<boolean> => {
    if (!canEdit) return false;
    if (saveInFlightRef.current) {
      needsFlushRef.current = true;
      return false;
    }
    saveInFlightRef.current = true;
    needsFlushRef.current = false;
    setSaveState("saving");
    setSaveError(null);
    let ok = false;

    try {
      // Loop until the persisted snapshot matches the live editor (and title).
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const saveId = ++latestSaveIdRef.current;
        const contentSnapshot = readLiveContent();
        const contentFp = contentFingerprint(contentSnapshot);
        const titleSnapshot = pendingTitleRef.current;
        const payload: { title?: string; content_json?: unknown } = {
          content_json: contentSnapshot,
        };
        if (titleSnapshot != null) payload.title = titleSnapshot;

        rememberLocalFingerprint(contentFp);
        if (broadcastTimer.current) clearTimeout(broadcastTimer.current);
        publishRef.current?.(contentSnapshot);

        const res = await fetch(`/api/documents/${initialDoc.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Save failed");

        const liveAfter = readLiveContent();
        const completion = saveCompletionState({
          saveId,
          latestSaveId: latestSaveIdRef.current,
          savedFingerprint: contentFp,
          currentFingerprint: contentFingerprint(liveAfter),
        });

        const saved = data.document as DocumentRow | undefined;
        if (saved?.updated_at && completion.isLatest) {
          lastAppliedRemoteAtRef.current = toEpochMs(saved.updated_at);
          publishRef.current?.(contentSnapshot, saved.updated_at);
        }

        if (titleSnapshot != null && pendingTitleRef.current === titleSnapshot) {
          pendingTitleRef.current = null;
        }

        if (!completion.isLatest || completion.stillDirty || pendingTitleRef.current != null) {
          continue;
        }

        lastFingerprintRef.current = contentFp;
        localDirtyRef.current = false;
        setSaveState("saved");
        ok = true;
        break;
      }
    } catch (e) {
      setSaveState("error");
      setSaveError(e instanceof Error ? e.message : "Save failed");
      ok = false;
    } finally {
      saveInFlightRef.current = false;
      if (
        needsFlushRef.current ||
        localDirtyRef.current ||
        pendingTitleRef.current != null
      ) {
        needsFlushRef.current = false;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
          void flushSave();
        }, 50);
      }
    }
    return ok;
  }, [canEdit, initialDoc.id, readLiveContent, rememberLocalFingerprint]);

  const scheduleContentSave = useCallback(() => {
    if (!canEdit) return;
    localDirtyRef.current = true;
    localEditAtRef.current = Date.now();
    lastFingerprintRef.current = contentFingerprint(latestJson.current);
    setSaveState("dirty");
    queueBroadcast(latestJson.current);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void flushSave();
    }, 600);
  }, [canEdit, flushSave, queueBroadcast]);

  const scheduleTitleSave = useCallback(
    (nextTitle: string) => {
      if (!canEdit) return;
      pendingTitleRef.current = nextTitle;
      localDirtyRef.current = true;
      setSaveState("dirty");
      if (titleTimer.current) clearTimeout(titleTimer.current);
      titleTimer.current = setTimeout(() => {
        void flushSave();
      }, 600);
    },
    [canEdit, flushSave],
  );

  const handleChange = useCallback(
    (editorState: EditorState, editor: LexicalEditor) => {
      editorRef.current = editor;
      // Always keep latestJson aligned with the editor, even for programmatic
      // applies — dropping this update caused saves of a stale 1-char snapshot.
      latestJson.current = editorState.toJSON();
      if (skipNextChange.current) {
        skipNextChange.current = false;
        return;
      }
      scheduleContentSave();
    },
    [scheduleContentSave],
  );

  const waitForEditor = useCallback(async (): Promise<LexicalEditor> => {
    for (let i = 0; i < 40; i++) {
      if (editorRef.current) return editorRef.current;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error("Editor is not ready. Wait a moment and try Import again.");
  }, []);

  const manualSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (titleTimer.current) clearTimeout(titleTimer.current);
    pendingTitleRef.current = title;
    localDirtyRef.current = true;
    void flushSave();
  }, [flushSave, title]);

  const goHome = useCallback(
    async (e: ReactMouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (titleTimer.current) clearTimeout(titleTimer.current);
      if (canEdit && (localDirtyRef.current || saveState === "dirty" || saveState === "saving")) {
        await flushSave();
      } else if (canEdit) {
        // Final belt-and-suspenders write of whatever is on screen.
        localDirtyRef.current = true;
        await flushSave();
      }
      router.push("/home");
    },
    [canEdit, flushSave, router, saveState],
  );

  // Flush pending edits if the tab is closed / refreshed.
  useEffect(() => {
    const onHide = () => {
      if (!canEdit) return;
      if (!localDirtyRef.current && saveState !== "dirty") return;
      const content = readLiveContent();
      const body = JSON.stringify({
        content_json: content,
        title: pendingTitleRef.current ?? undefined,
      });
      void fetch(`/api/documents/${initialDoc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      });
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [canEdit, initialDoc.id, readLiveContent, saveState]);

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
      const editor = await waitForEditor();

      let currentText = "";
      editor.getEditorState().read(() => {
        currentText = $getRoot().getTextContent();
      });

      if (shouldConfirmReplace(currentText)) {
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

      const serialized = serializeImportedContent(data.content_json);
      latestJson.current = data.content_json;
      lastFingerprintRef.current = contentFingerprint(data.content_json);
      localDirtyRef.current = false;
      skipNextChange.current = true;

      // Apply imported Lexical JSON into the live editor (works for soft sync;
      // for Yjs, setEditorState updates the bound doc and we cleared server Yjs state).
      editor.setEditorState(editor.parseEditorState(serialized));
      publishRef.current?.(data.content_json);
      setSaveState("saved");
      setSaveError(null);
    },
    [initialDoc.id, waitForEditor],
  );

  const onRemoteContent = useCallback(
    (payload: { content_json: unknown; updated_at: string }) => {
      const editor = editorRef.current;
      if (!editor) return;

      const fingerprint = contentFingerprint(payload.content_json);
      const localFp = contentFingerprint(latestJson.current);

      // Never apply our own save/broadcast echo — that was wiping longer local
      // drafts back down to a short in-flight snapshot ("only 1 character saved").
      if (
        shouldIgnoreRemoteEcho({
          remoteFingerprint: fingerprint,
          localFingerprint: localFp,
          recentLocalFingerprints: recentLocalFingerprints.current,
        })
      ) {
        if (payload.updated_at) {
          lastAppliedRemoteAtRef.current = Math.max(
            lastAppliedRemoteAtRef.current,
            toEpochMs(payload.updated_at),
          );
        }
        return;
      }

      if (fingerprint === lastFingerprintRef.current) return;

      const apply = shouldApplyRemoteContent({
        remoteUpdatedAt: payload.updated_at,
        lastAppliedRemoteAt: lastAppliedRemoteAtRef.current,
        localDirty: localDirtyRef.current || saveInFlightRef.current,
        localEditAt: localEditAtRef.current,
      });
      if (!apply) return;

      skipNextChange.current = true;
      latestJson.current = payload.content_json;
      lastFingerprintRef.current = fingerprint;
      lastAppliedRemoteAtRef.current = toEpochMs(payload.updated_at);
      editor.setEditorState(
        editor.parseEditorState(JSON.stringify(payload.content_json)),
      );
    },
    [],
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
        <EditorRefPlugin editorRef={editorRef} />
        <EditableGate canEdit={canEdit} />
        <SoftSyncPlugin
          documentId={initialDoc.id}
          userId={user.id}
          onRemoteContent={onRemoteContent}
          publishRef={publishRef}
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
            onClick={goHome}
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
