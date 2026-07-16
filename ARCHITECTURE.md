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

### Primary: Yjs + Supabase Realtime (`NEXT_PUBLIC_COLLAB_MODE=yjs`)

- Client creates a Lexical `CollaborationPlugin` with a **provider factory** that wraps `SupabaseProvider` from `@supabase-labs/y-supabase` in an adapter matching Lexical’s `Provider` interface (`lib/collab/createSupabaseProvider.ts`).
- Updates broadcast over Supabase Realtime channels; Yjs state persisted to `yjs_documents` (room/state).
- Lexical JSON continues to autosave to `content_json` so documents remain readable without Yjs bootstrap.
- Presence avatars use Supabase Realtime **Presence** on `presence:doc:{id}` (works independently of Yjs).
- Editors send updates; viewers receive them but `editable=false`.

### Fallback: soft sync (`NEXT_PUBLIC_COLLAB_MODE=soft`)

Use when Yjs + y-supabase is unstable in your project, or Realtime policies block the channel:

- Debounced autosave writes `content_json`.
- Clients subscribe to `postgres_changes` on `documents` for the open doc id and apply remote JSON when local state is not dirty.
- Presence avatars still use Realtime Presence.

Set `NEXT_PUBLIC_COLLAB_MODE=soft` in Vercel / `.env.local` to force the fallback. The editor UI shows a **live** vs **soft sync** badge.

## File handling

| Action | Types | Behavior |
|--------|-------|----------|
| Home → Upload as new | `.txt` `.md` `.docx` | Parse → create new document titled from filename |
| Editor → Import content | `.txt` `.md` `.docx` | Replace current Lexical JSON (confirm if non-empty) |
| Editor → Attach file | images + `.pdf` | Upload to Storage; list under Files |

## Trust boundaries

- Browser never holds the service role key.
- CRUD/import/share go through Next.js API routes that verify the session cookie, then mutate with the service role.
- Anon key is used only for Realtime (and optional client reads of signed attachment URLs already minted by the API).

## Out of scope

Comments, version history, folders, email invites, SSO, offline-first, Google Docs parity.
