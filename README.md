# Workgether

Lightweight Google Docs–style collaborative editor built with **Next.js**, **Lexical**, **Yjs**, and **Supabase** (Postgres + Storage + Realtime). No TipTap Cloud or Liveblocks.

## Features

- Username + password auth (auto-register if username is new; error if password is wrong)
- Lexical editor: bold, italic, underline, headings, bulleted/numbered lists
- Manual **Save** + debounced autosave (~1.5s) with Saved / Saving / error status
- Per-document share links with **Viewer** or **Editor** role
- Upload on home creates a new doc; while editing you can **Attach** files or **Import** content
- Realtime collab via Yjs + `@supabase-labs/y-supabase` (soft-sync fallback available)

## Supported file types

| Use | Extensions |
|-----|------------|
| New document / import content | `.txt`, `.md`, `.docx` |
| Attachments | `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.pdf` |

Unsupported types are rejected with a clear UI/API error.

## Local setup

### 1. Clone & install

```bash
git clone https://github.com/LeoHub-dev/workgether.git
cd workgether
npm install
cp .env.example .env.local
```

### 2. Supabase project

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql).
3. Confirm Storage bucket **`attachments`** exists (the migration inserts it).
4. (Optional for soft sync) enable Realtime for `documents`:
   - Database → Publications → `supabase_realtime` → add `documents`.
5. Copy **Project URL**, **anon key**, and **service_role key** from Settings → API into `.env.local`.
6. Set a long random `AUTH_SECRET` (32+ characters).

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
AUTH_SECRET=your-long-random-secret
NEXT_PUBLIC_COLLAB_MODE=yjs
```

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Demo flow (two accounts)

1. Browser A: register `alice` / `password1` → New document → Share → set **Editor** → Copy link.
2. Browser B (incognito): open share link → register `bob` / `password2` → land in the same doc.
3. Edit in both windows; presence avatars appear; Save / autosave persist content.
4. Change share role to **Viewer** and confirm Bob can no longer edit.

## Vercel deploy

1. Import the GitHub repo in Vercel.
2. Set environment variables (same as `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `AUTH_SECRET`
   - `NEXT_PUBLIC_COLLAB_MODE` (`yjs` or `soft`)
3. Deploy. Run the SQL migration on Supabase before first login.
4. Optional: set `NEXT_PUBLIC_APP_URL` to your production URL (not required for core flows).

Framework preset: **Next.js**. Build command: `next build`.

## Scripts

```bash
npm run dev      # local development
npm run build    # production build
npm run start    # serve production build
npm run test     # Vitest (auth + access helpers)
npm run lint     # ESLint
```

## Project layout

- `app/page.tsx` — login / auto-register
- `app/home/page.tsx` — owned vs shared documents, create, upload-as-new
- `app/docs/[id]/page.tsx` — editor shell
- `app/share/[token]/page.tsx` — share link gate → editor
- `components/editor/DocumentEditor.tsx` — Lexical + toolbar + collab
- `app/api/**` — auth, documents, share, import, attachments
- `lib/auth.ts` — cookie session (jose)
- `lib/supabase/server.ts` — service role client
- `supabase/migrations/001_init.sql` — schema + storage bucket
- `ARCHITECTURE.md` — design decisions and realtime fallback

## Soft sync fallback

If Yjs + Supabase Realtime is unreliable in your environment, set:

```env
NEXT_PUBLIC_COLLAB_MODE=soft
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for details.
