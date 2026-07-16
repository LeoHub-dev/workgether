import type { Provider, ProviderAwareness, UserState } from "@lexical/yjs";
import { SupabaseProvider } from "@supabase-labs/y-supabase";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Doc } from "yjs";
import * as Y from "yjs";

type StatusPayload = { status: string };
type ListenerMap = {
  sync: Set<(isSynced: boolean) => void>;
  status: Set<(payload: StatusPayload) => void>;
  update: Set<(payload: unknown) => void>;
  reload: Set<(doc: Doc) => void>;
};

/**
 * Adapts @supabase-labs/y-supabase SupabaseProvider to Lexical's Provider interface.
 */
export function createSupabaseYjsProvider(
  id: string,
  yjsDocMap: Map<string, Doc>,
  options: {
    username: string;
    color: string;
    canEdit: boolean;
  },
): Provider {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase public env vars missing for realtime collab");
  }

  let doc = yjsDocMap.get(id);
  if (!doc) {
    doc = new Y.Doc();
    yjsDocMap.set(id, doc);
  }

  const supabase: SupabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const supabaseProvider = new SupabaseProvider(`doc:${id}`, doc, supabase, {
    awareness: true,
    persistence: {
      table: "yjs_documents",
      roomColumn: "room",
      stateColumn: "state",
      storeTimeout: 1500,
    },
    broadcastThrottleMs: 50,
  });

  // Viewers still receive updates but we avoid local awareness write noise
  const awareness = supabaseProvider.getAwareness();
  if (!awareness) {
    throw new Error("Awareness failed to initialize");
  }

  awareness.setLocalStateField("user", {
    name: options.username,
    color: options.color,
  });

  const listeners: ListenerMap = {
    sync: new Set(),
    status: new Set(),
    update: new Set(),
    reload: new Set(),
  };

  let synced = false;

  const providerAwareness: ProviderAwareness = {
    getLocalState: () => (awareness.getLocalState() as UserState | null) ?? null,
    getStates: () => awareness.getStates() as Map<number, UserState>,
    on: (type, cb) => {
      if (type === "update") awareness.on("update", cb);
    },
    off: (type, cb) => {
      if (type === "update") awareness.off("update", cb);
    },
    setLocalState: (state) => awareness.setLocalState(state),
    setLocalStateField: (field, value) =>
      awareness.setLocalStateField(field, value),
  };

  const markSynced = () => {
    if (synced) return;
    synced = true;
    listeners.sync.forEach((cb) => cb(true));
  };

  supabaseProvider.on("status", (status) => {
    listeners.status.forEach((cb) => cb({ status }));
    if (status === "connected") {
      // Soft sync signal for Lexical — provider does not emit classic 'sync'
      setTimeout(markSynced, 300);
    }
  });

  supabaseProvider.getPersistence()?.on("synced", () => {
    markSynced();
  });

  supabaseProvider.on("connect", () => {
    listeners.status.forEach((cb) => cb({ status: "connected" }));
    setTimeout(markSynced, 200);
  });

  const provider: Provider = {
    awareness: providerAwareness,
    connect() {
      supabaseProvider.connect();
    },
    disconnect() {
      supabaseProvider.destroy();
    },
    on(type, cb) {
      if (type === "sync") listeners.sync.add(cb as (isSynced: boolean) => void);
      if (type === "status") listeners.status.add(cb as (p: StatusPayload) => void);
      if (type === "update") listeners.update.add(cb as (p: unknown) => void);
      if (type === "reload") listeners.reload.add(cb as (doc: Doc) => void);
    },
    off(type, cb) {
      if (type === "sync") listeners.sync.delete(cb as (isSynced: boolean) => void);
      if (type === "status") listeners.status.delete(cb as (p: StatusPayload) => void);
      if (type === "update") listeners.update.delete(cb as (p: unknown) => void);
      if (type === "reload") listeners.reload.delete(cb as (doc: Doc) => void);
    },
  };

  // Start connected (constructor already connects; ensure Lexical can re-call)
  return provider;
}

export function getCollabMode(): "yjs" | "soft" {
  const mode = process.env.NEXT_PUBLIC_COLLAB_MODE;
  if (mode === "soft") return "soft";
  if (
    typeof window !== "undefined" &&
    (!process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  ) {
    return "soft";
  }
  return "yjs";
}
