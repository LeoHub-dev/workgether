# Product Requirements Document — Workgether

## Overview

Workgether is a lightweight collaborative document editor inspired by Google Docs. Users sign in with a simple username/password flow, create and edit rich-text documents in the browser, share documents via links (Viewer or Editor), upload/import files, and collaborate with near-realtime sync on a free Vercel + Supabase stack.

This is intentionally **not** enterprise Google Docs parity. Scope favors a coherent editing flow, clear sharing, persistence, and a deployable demo.

## Goals

1. Let a user create, rename, edit, save, and reopen documents with basic rich text.
2. Support product-relevant file upload (new doc from file, attach files, import content into a draft).
3. Demonstrate sharing with an owner, grant-access-by-link, and owned vs shared distinction.
4. Persist documents and access so refresh and multi-browser demos work.
5. Ship with setup docs, Vercel deployment path, basic validation, and at least one automated test.

## Non-goals

- Comments, suggestions, version history
- Folders, search, templates, offline-first
- Email invites, SSO, enterprise ACL
- Paid collaboration hosts (TipTap Cloud, Liveblocks)
- Pixel-perfect Google Docs UX

## Personas

| Persona | Need |
|---------|------|
| Document owner | Creates docs, edits, shares a link with Viewer or Editor |
| Collaborator | Opens a share link while logged in, edits or views per role |
| Reviewer / deployer | Sets up Supabase + Vercel from README and verifies the demo flow |

## User stories

### Auth

- As a new user, I enter a username and password and an account is created so I can start immediately.
- As a returning user, I enter the same username and correct password and am logged in.
- As a user who mistypes the password for an existing username, I see a clear error and am not logged in.

### Documents

- As a logged-in user, I can create a blank document and open it in the editor.
- As an owner, I can rename a document from the home list or editor context.
- As an editor, I can apply bold, italic, underline, headings, and bulleted/numbered lists.
- As an editor, I can click **Save** and also rely on debounced autosave (~1.5s) with Saved / Saving / error status.
- After refresh, my document content and formatting remain available.

### Upload

- On the home page, I can upload `.txt`, `.md`, or `.docx` and get a **new** editable document titled from the filename.
- While editing, I can **Attach** images/PDF (and similar) associated with the document.
- While editing, I can **Import content** from `.txt` / `.md` / `.docx` into the current document (confirm if the doc is non-empty).
- Unsupported file types are rejected with a clear message in the UI.

### Sharing

- As an owner, I can generate a share link and choose **Viewer** or **Editor**.
- As another logged-in user, opening `/share/[token]` grants access per role and opens the document.
- On home, I can distinguish **My documents** from **Shared** documents.
- Viewers cannot edit content or change share settings.

### Collaboration

- When multiple users open the same document with edit access, they see presence indicators (who is in the doc).
- Primary mode: Yjs + Lexical + Supabase Realtime for live content sync.
- Fallback: soft sync (`NEXT_PUBLIC_COLLAB_MODE=soft`) via autosave + Postgres changes + presence, documented in `ARCHITECTURE.md`.

## Functional requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-1 | Auto-register / login / wrong-password auth on `/` | P0 |
| FR-2 | Session via signed HTTP-only cookie; middleware protects app routes | P0 |
| FR-3 | Document CRUD: create, rename, list, open, save | P0 |
| FR-4 | Lexical rich text: bold, italic, underline, headings, lists | P0 |
| FR-5 | Manual save + debounced autosave with status | P0 |
| FR-6 | Persist Lexical JSON (and collab state as designed) in Supabase | P0 |
| FR-7 | Home upload → new document (txt/md/docx) | P0 |
| FR-8 | Editor attach files to Storage + list under doc | P0 |
| FR-9 | Editor import content into current doc | P0 |
| FR-10 | Share link with Viewer or Editor role | P0 |
| FR-11 | Owned vs shared visible on home | P0 |
| FR-12 | Presence indicators for open document | P1 |
| FR-13 | Realtime content sync (Yjs) or soft-sync fallback | P1 |
| FR-14 | API validation and 401/403/404 error handling | P0 |
| FR-15 | At least one meaningful automated test | P0 |
| FR-16 | README + architecture note + Vercel/Supabase setup | P0 |

## Supported file types

| Use | Extensions |
|-----|------------|
| New document / import content | `.txt`, `.md`, `.docx` |
| Attachments | `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.pdf` |

## Information architecture

| Route | Purpose |
|-------|---------|
| `/` | Login / auto-register |
| `/home` | Document list (owned vs shared), create, upload-as-new |
| `/docs/[id]` | Editor, save, share, attach, import, presence |
| `/share/[token]` | Login gate → grant access → redirect to editor |

## Data model (logical)

- **users** — username, password hash
- **documents** — title, owner, content JSON, share token/role, timestamps
- **attachments** — file metadata + Storage path per document
- **document_access** — tracks shared docs opened by a user for the Shared list
- **Storage bucket `attachments`** — binary files

## Technical constraints

- Deploy on **Vercel** (Next.js App Router).
- Persist with **Supabase** (Postgres + Storage + Realtime).
- Auth is **custom** (not Supabase Auth): bcrypt + jose cookie.
- No paid realtime hosts; prefer free Supabase Realtime.
- Service role key stays server-only (API routes); never exposed to the browser.

## Success criteria

1. Two browsers with two accounts can share a link and collaborate (or soft-sync) without paid services.
2. Documents survive refresh with formatting preserved.
3. Upload paths work as specified; unsupported types fail clearly.
4. A reviewer can deploy from README with Framework Preset **Next.js**, Root Directory `.`, and documented env vars.
5. Automated tests for auth/access helpers pass (`npm test`).

## Out of scope (v1)

Comments, history, folders, email, SSO, mobile apps, offline mode, Google Docs feature parity.

## Related docs

- [README.md](./README.md) — setup, Vercel, env keys
- [ARCHITECTURE.md](./ARCHITECTURE.md) — stack choices and collab modes
