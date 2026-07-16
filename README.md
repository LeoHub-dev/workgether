# Workgether

Lightweight Google Docs–style collaborative editor built with **Next.js**, **Lexical**, **Yjs**, and **Supabase** (Postgres + Storage + Realtime). No TipTap Cloud or Liveblocks.

Product requirements: [PRD.md](./PRD.md) · Design notes: [ARCHITECTURE.md](./ARCHITECTURE.md)

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

### 2. Database — pick one

#### Option A (recommended): Local Supabase via Docker (no cloud project)

This runs Postgres + Storage + Realtime on your machine and replaces a hosted Supabase project for local work.

**Requirements:** Docker Desktop (or Docker Engine) running.

```bash
# Install CLI once (or use npx each time)
npm install -g supabase

# Start local stack (API http://127.0.0.1:54321, DB port 54322)
npx supabase start

# Apply schema + storage bucket
npx supabase db reset
# (runs supabase/migrations/*.sql against the local DB)
```

Copy keys from the start/status output into `.env.local`:

```bash
npx supabase status
```

| Status field | Env var |
|--------------|---------|
| `API URL` | `NEXT_PUBLIC_SUPABASE_URL` (e.g. `http://127.0.0.1:54321`) |
| `anon key` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role key` | `SUPABASE_SERVICE_ROLE_KEY` |

Also set:

```env
AUTH_SECRET=dev-secret-change-me-to-32-chars-min
NEXT_PUBLIC_COLLAB_MODE=soft
```

`soft` avoids Yjs/Realtime edge cases while you develop import/edit flows; switch to `yjs` when you want live collab locally.

Stop the stack when done:

```bash
npx supabase stop
```

#### Option B: Cloud Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql).
3. Confirm Storage bucket **`attachments`** exists (the migration inserts it when `storage.buckets` exists).
4. (Optional for soft sync) enable Realtime for `documents`:
   - Database → Publications → `supabase_realtime` → add `documents`.
5. Copy API keys into `.env.local` (see [Where to get Supabase keys](#where-to-get-supabase-keys) below).
6. Set a long random `AUTH_SECRET` (32+ characters).

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
AUTH_SECRET=your-long-random-secret
NEXT_PUBLIC_COLLAB_MODE=yjs
```

#### Option C: Plain Postgres only (SQL inspection)

[`docker-compose.yml`](docker-compose.yml) starts Postgres 16 on port **54322** and loads the migration. This app still talks to Supabase’s HTTP API (`supabase-js`), so **Option A or B is required to run the Next.js app**. Use compose if you only want a local SQL database to inspect schema/data:

```bash
docker compose up -d
# psql postgres://postgres:postgres@127.0.0.1:54322/workgether
```

### Where to get Supabase keys

**Cloud:** In the [Supabase Dashboard](https://supabase.com/dashboard):

1. Open your project.
2. Go to **Project Settings** (gear icon) → **API**.
3. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **Project API keys → `anon` `public`** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **Project API keys → `service_role` `secret`** → `SUPABASE_SERVICE_ROLE_KEY`

**Local:** run `npx supabase status` (see Option A).

**Important:** The `service_role` key bypasses Row Level Security. Use it **only** on the server (Next.js API routes / Vercel env). Never put it in client code or commit it to git. In the dashboard it may be hidden behind a **Reveal** / eye icon.

If your project uses the newer API keys UI, look for **Legacy API keys** or **Secret keys** — you still need the `service_role` JWT (starts with `eyJ...`) for this app’s server client.

### 3. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 4. Tests

```bash
npm test
```

Includes auth helpers and **import / edit-file** coverage (`tests/import-content.test.ts`): `.txt`/`.md` parsing, Lexical JSON shape, replace-confirm rules.

## Demo flow (two accounts)

1. Browser A: register `alice` / `password1` → New document → Share → set **Editor** → Copy link.
2. Browser B (incognito): open share link → register `bob` / `password2` → land in the same doc.
3. Edit in both windows; presence avatars appear; Save / autosave persist content.
4. Change share role to **Viewer** and confirm Bob can no longer edit.

## Vercel deploy

### Project configuration

When importing the GitHub repo in the Vercel dashboard, use:

| Setting | Value |
|---------|--------|
| **Framework Preset** (also shown as Application Preset) | **Next.js** |
| **Root Directory** | `.` (repo root — leave default; do not set a subfolder) |
| **Build Command** | `next build` (default for Next.js) |
| **Output Directory** | leave default (Next.js handles this) |
| **Install Command** | `npm install` (default) |
| **Node.js Version** | 20.x recommended |

This app is not a monorepo. Root Directory must stay at the repository root where `package.json` and `app/` live.

### Environment variables

In **Project → Settings → Environment Variables**, add (for Production / Preview as needed):

| Name | Notes |
|------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` `secret` key — [where to get it](#where-to-get-supabase-keys) |
| `AUTH_SECRET` | Long random string (32+ chars) for signing cookies |
| `NEXT_PUBLIC_COLLAB_MODE` | `yjs` (default) or `soft` |

Optional: `NEXT_PUBLIC_APP_URL` = your production URL (not required for core flows).

### Deploy steps

1. Import **LeoHub-dev/workgether** (or your fork) in Vercel.
2. Set **Production Branch** to `main` (Settings → Git).
3. Confirm Framework Preset **Next.js** and Root Directory is **empty** / `.` (not `app`, not a subfolder).
4. Add the environment variables above.
5. Ensure [`supabase/migrations/001_init.sql`](supabase/migrations/001_init.sql) has been run on Supabase **before** first login.
6. Deploy from the latest `main` commit (Deployments → Redeploy, or push a new commit).

### Troubleshooting: “No Next.js version detected”

This almost always means Vercel is building a commit/branch that does **not** contain the app `package.json` (for example an old `main` that only had `.gitignore`), or **Root Directory** points at the wrong folder.

Fix:

1. In GitHub, open `main` and confirm `package.json` exists at the repo root and includes `"next"` under `dependencies`.
2. In Vercel → **Settings → General → Root Directory**: clear it (repo root). Save.
3. In Vercel → **Settings → General → Framework Preset**: **Next.js**.
4. In Vercel → **Settings → Git**: Production Branch = `main`.
5. **Deployments → … → Redeploy** the latest production deployment, or trigger a new deploy from current `main`. Do not redeploy an old failed commit from before the app was merged.

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
- `PRD.md` — product requirements
- `ARCHITECTURE.md` — design decisions and realtime fallback

## Soft sync fallback

If Yjs + Supabase Realtime is unreliable in your environment, set:

```env
NEXT_PUBLIC_COLLAB_MODE=soft
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for details.
