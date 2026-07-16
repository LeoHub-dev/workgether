# Architecture — Workgether

## Goals (priority order)

1. **Working software** a reviewer can deploy on Vercel + Supabase without paid TipTap Cloud / Liveblocks.
2. **Correct access control**: owner full access; share links grant Viewer or Editor; viewers are read-only (`setEditable(false)`).
3. **Reliable persistence**: Lexical JSON in `documents.content_json` via manual Save + ~1.5s debounced autosave.
4. **Realtime collaboration** on the free Supabase Realtime tier when credentials are present.
5. Clear docs over clever abstractions.

## Stack

| Layer | Choice |
|-------|--------|
| App | Next.js App Router + TypeScript + Tailwind |
| Editor | Lexical (`@lexical/react`, rich-text, list, history, toolbar) |
| Auth | Custom username/password (bcryptjs) + signed HTTP-only cookie (`jose` + `AUTH_SECRET`) — **not** Supabase Auth |
| Data | Supabase Postgres (service role on server) |
| Files | Supabase Storage bucket `attachments` |
| Collab | Yjs + `@lexical/yjs` CollaborationPlugin + `@supabase-labs/y-supabase` |

## Auth flow

- `POST /api/auth/login`: if username missing → create user with bcrypt hash; if exists and password matches → login; if exists and password wrong → **401**.
- Session JWT in `workgether_session` cookie.
- Middleware protects `/home`, `/docs/*`, `/share/*`.

## Document access

- Owner: full CRUD + share settings.
- `document_access` rows track shared docs opened via `/share/[token]` so they appear under **Shared** on home.
- Share: unique `share_token` + `share_role` (`viewer` | `editor`). Opening the link while logged in upserts `document_access` and redirects to `/docs/[id]`.

## Realtime choice

### Primary (default): soft sync (`NEXT_PUBLIC_COLLAB_MODE=soft`)

`content_json` is the source of truth for save/reopen. See fallback section below — this is now the default because stale Yjs snapshots previously could reopen a document as only the first typed character.

### Optional: Yjs + Supabase Realtime (`NEXT_PUBLIC_COLLAB_MODE=yjs`)

- Client creates a Lexical `CollaborationPlugin` with a **provider factory** that wraps `SupabaseProvider` from `@supabase-labs/y-supabase` in an adapter matching Lexical’s `Provider` interface (`lib/collab/createSupabaseProvider.ts`).
- Room key is the document UUID (must match PATCH cleanup). Legacy `doc:{id}` rows are deleted on save.
- Updates broadcast over Supabase Realtime channels; Yjs rows in `yjs_documents` are **cleared whenever `content_json` is saved** so reopen bootstraps from the full Lexical JSON.
- Presence avatars use Supabase Realtime **Presence** on `presence:doc:{id}` (works independently of Yjs).
- Editors send updates; viewers receive them but `editable=false`.

### Soft sync details (default)

- Debounced autosave writes **live** Lexical JSON from `editor.getEditorState()` (not a stale ref).
- Saves go through a **serialized `SaveQueue`** so Home navigation always waits for in-flight PATCHes (fixes new-doc “type abc → home → empty”).
- Mount-time empty OnChange is ignored until the user actually edits.
- Flush-on-home-navigation / `pagehide` keepalive as a backup.
- Docs/home are `force-dynamic`; PATCH calls `revalidatePath`. The editor does a **one-shot** no-store hydrate only when the mount is still empty (never while typing). Do **not** `router.refresh()` or remount on `updated_at` during editing — that steals focus.
- Clients **broadcast** content on `soft:doc:{id}` for peer format/text sync; `postgres_changes` is a backup.
- Echoes of our own saves are ignored; remote apply is timestamp-aware (`lib/sync-content.ts`).
- Presence avatars use Realtime Presence.

Set `NEXT_PUBLIC_COLLAB_MODE=yjs` only if you explicitly want CRDT live editing. The editor UI shows a **live** vs **soft sync** badge.

Yjs builds alias a single `yjs` package in `next.config.ts` to avoid duplicate CRDT instances that break mark sync.

## File handling

| Action | Types | Behavior |
|--------|-------|----------|
| Home → Upload as new | `.txt` `.md` `.docx` | Parse → create new document titled from filename |
| Editor → Import content | `.txt` `.md` `.docx` | Parse → write `content_json`, clear `yjs_state` + `yjs_documents` row, replace live Lexical state (confirm if non-empty) |
| Editor → Attach file | images + `.pdf` | Upload to Storage; list under Files |

Import parsing lives in `lib/file-parse.ts` (`textToLexicalState` / `parseContentFile`). Editor apply helpers are in `lib/import-content.ts`. The editor captures Lexical via `EditorRefPlugin` so import works even before the user types.

## Trust boundaries

- Browser never holds the service role key.
- CRUD/import/share go through Next.js API routes that verify the session cookie, then mutate with the service role.
- Anon key is used only for Realtime (and optional client reads of signed attachment URLs already minted by the API).

## Out of scope

Comments, version history, folders, email invites, SSO, offline-first, Google Docs parity.
