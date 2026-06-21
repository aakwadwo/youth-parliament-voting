# National Youth Parliament of Ghana — Voting Platform

The official voting platform for the National Youth Parliament of Ghana elections. Built with Next.js (App Router), Supabase (Postgres), and Tailwind CSS.

## Project overview

- **Voters** register with their name, date of birth, and phone number, then vote once for a candidate in their own constituency.
- **Ballots are anonymous**: the `votes` table stores only `candidate_id`, `constituency_id`, and `voted_at` — nothing links a ballot back to the voter who cast it. Double-voting is prevented by an atomic `has_voted` flag on `voters`, flipped in the same database transaction as the ballot insert (see `cast_vote()` in `migrations/`).
- **Admins** manage constituencies, candidates, election settings (voting window, open/closed), and view aggregated results, behind a separate JWT-protected `/admin` area.
- All server-side database access goes through the Supabase **service-role** key (`src/lib/supabase-admin.js`) — there is no Supabase Auth session anywhere in this app, so the public anon key carries no useful identity and is not used by any code.

## Environment variables

Copy `.env.local` (not committed) and fill in:

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No (unused by app code) | Issued by Supabase by default; kept only so Supabase RLS has *something* to deny. See the comment above it in `.env.local`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Used by every server-side query/mutation. Never expose this to the client. |
| `ADMIN_JWT_SECRET` | Yes | Signs the admin session cookie (`admin_token`). |
| `VOTER_JWT_SECRET` | Yes | Signs the voter session cookie (`voter_token`), issued on register/login and required by `/api/vote`. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Recommended | Backs rate limiting (`src/lib/rate-limit.js`). Without these, rate limiting fails open (allows all requests) and logs a warning — fine for local dev, **not** acceptable in production. |
| `SENTRY_DSN` | Optional | Server-side error reporting. |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional | Client-side error reporting — must be set to the *same* DSN as `SENTRY_DSN` (Next.js only exposes `NEXT_PUBLIC_`-prefixed vars to the browser). |

## Running locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Voter flow starts at `/`, admin portal at `/admin/login`.

```bash
npm run lint    # ESLint
npm run build   # production build (also type-checks)
```

## Database setup / seeding

SQL migrations live in `migrations/`, numbered and paired as `*.up.sql` / `*.down.sql`. There is no migration runner wired up — run each `.up.sql` file in order against your Supabase project via the SQL Editor (or `psql`), oldest first.

The schema (defined outside this repo, in Supabase) is expected to have, at minimum:

- `constituencies` (`id`, `name`, `region`, `code`)
- `candidates` (`id`, `full_name`, `constituency_id`, `photo_url`, `is_active`)
- `voters` (`id`, `full_name`, `voter_dob`, `voter_phone`, `constituency_id`, `has_voted`)
- `votes` (`id`, `candidate_id`, `constituency_id`, `voted_at`) — no voter reference, by design
- `election_settings` (single row: `id`, `election_name`, `is_active`, `voting_opens_at`, `voting_closes_at`)
- `admins` (`id`, `email`, `password_hash`, `role`) — `password_hash` is a bcrypt hash; create admin users manually (e.g. via the SQL Editor) using `bcrypt.hashSync('the-password', 10)` to generate the hash
- `admin_audit_log` (created by `migrations/0005_create_admin_audit_log.up.sql`)

To seed constituencies/candidates, log into `/admin` and use **Constituencies → Bulk import CSV** (columns: `name,region,code`), then add candidates individually under **Candidates**.

## Deploying

This is a standard Next.js app — any platform that supports the Next.js App Router (e.g. Vercel) works. Before deploying:

1. Run every migration in `migrations/` against your production Supabase project.
2. Set every environment variable above in your hosting platform's dashboard (not just `.env.local`).
3. Confirm Supabase Row Level Security denies the anon/authenticated roles on every table — the app never relies on RLS for its own access (it uses the service-role key), but RLS is what stops someone calling the Supabase REST API directly with the public anon key.
4. Set up an Upstash Redis database and a Sentry project (see the project's security audit notes) before taking real traffic — without them the app still works, but with no real rate limiting or error visibility.
