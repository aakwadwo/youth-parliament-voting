# National Youth Parliament of Ghana — Voting Platform

The official voting platform for National Youth Parliament of Ghana elections. Next.js (App Router), Supabase (Postgres) and Tailwind CSS v4.

---

## How the system works

- **Voters** register with their name, date of birth, phone number and constituency, then cast one ballot for a candidate standing in that constituency.
- **Ballots are anonymous.** The `votes` table holds only `candidate_id`, `constituency_id` and `voted_at`. No column anywhere links a ballot to the voter who cast it. Double voting is prevented by an atomic `has_voted` flag on `voters`, flipped inside the same transaction that inserts the ballot — see `cast_vote()` in `migrations/0008_harden_cast_vote.up.sql`.
- **Administrators** manage constituencies, candidates and the voting window, watch live results, release the result to the public, and export the official election report, behind a JWT-protected `/admin` area.
- **Voting ending does not publish the result.** Closing the poll stops ballots being accepted; the Electoral Commission then reviews the count and releases it explicitly from **Admin → Results**. Until it does, `/results` says the count is being reviewed and the landing page offers no link to it. See `election_settings.results_published_at` (migration `0015`).
- All server-side database access uses the Supabase **service-role** key (`src/lib/supabase-admin.js`). There is no Supabase Auth session anywhere in this app, so the public anon key carries no useful identity and no application code uses it.

### Ballot secrecy, precisely

The strongest claim this platform makes to voters is that nobody can determine how they voted. That holds because:

1. `votes` rows carry no voter reference — this is enforced by schema, not by convention (migration `0002`).
2. The eligibility check, the `has_voted` flip and the ballot insert all happen inside one `cast_vote()` transaction, so there is no intermediate state and no application-side correlation.
3. Nothing logs the pairing. The audit log records administrative actions, never ballots.

What this does *not* defend against is someone with direct database access correlating `voters.has_voted` timestamps against `votes.voted_at`. Voter rows currently have no "voted at" timestamp, which is deliberate — do not add one.

---

## Architecture

```
src/
  app/
    page.js                     landing page, public election status
    register/                   voter registration (canonical route)
    vote/                       -> redirects to /register (legacy links)
    vote/candidates/            the ballot: select, review, submit
    login/                      voter sign-in (phone + date of birth)
    admin/                      admin portal shell (responsive, deep-linkable)
    api/
      election/                 public election status — no counts, no results
      register|login|vote/      voter endpoints
      candidates|constituencies public reference data (cached)
      admin/…                   admin endpoints (gated in proxy.js)
  components/
    brand/                      the mark and the tricolour rule
    layout/                     PageShell, footer, page headings
    ui/                         design-system primitives
    admin/                      one component per admin section
  lib/
    validation.js               shared by browser and server — one source of truth
    election-report.js          the single report builder behind every export
    export/                     csv | xlsx (zero-dependency) | pdf writers
    http.js                     client IP, origin checks, no-store helpers
    rate-limit.js               two-dimensional limits (IP and identity)
migrations/                     numbered SQL, run in order
tests/                          node:test suite (no test framework dependency)
```

### Key architectural decisions

**All aggregation happens in Postgres.** `get_results()`, `get_election_stats()`, `get_constituency_turnout()` and `get_regional_turnout()` (migration `0009`) return at most a few hundred rows each. No route ever loads `votes` or `voters` into application memory, so the dashboard, the results view and the exported report all cost the same whether the register holds ten thousand voters or ten million.

**One report builder, five outputs.** The dashboard, the on-screen results, and the PDF, Excel and CSV exports all derive from `buildElectionReport()`. Three export formats each recomputing turnout independently is how an official report ends up disagreeing with the dashboard it came from.

**Every eligibility rule lives in `cast_vote()`.** The vote route makes one RPC call. Re-reading the voter, the election window and the candidate inside the writing transaction removes both two round trips of latency on the hottest path and a real time-of-check/time-of-use gap.

**Rate limiting runs on Postgres, not Redis.** `check_rate_limit()` (migration `0013`) reimplements Upstash's approximated sliding window inside the database, so the tuned limits keep their exact meaning. Dropping Upstash removed the only non-Supabase dependency *and* a security hole: the Redis limiter failed **open**, so anyone able to disrupt it switched off every brute-force protection at once. Postgres is already required by all of these routes — without it there is no voter to authenticate against — so nothing is left to attack when it is down. One row per identifier per window, not per request.

**Publication is a decision, not a timestamp comparison.** The public results page used to open itself the moment the voting window elapsed, which made the clock the publishing authority and left no room for the reconciliation that happens between the last ballot and the declaration. `areResultsPublic()` now requires both that voting has ended *and* that an administrator has released the count, and `readPublicResults()` refuses before it queries — so while publication is off, `get_results()` is never called and an unauthenticated request receives no figures to withhold. Reopening voting withdraws a published result on the next request without the column being touched.

**Validation is shared, not duplicated.** `src/lib/validation.js` is imported by the forms and by the API routes. Client-side checks are a courtesy; the server enforces every one of them again.

**The XLSX writer has no dependencies.** An `.xlsx` file is a ZIP of XML, and Node ships DEFLATE and CRC-32. The leading spreadsheet library pulls roughly sixty transitive packages — several unmaintained, one with a live advisory — into a system that decides an election. `src/lib/export/zip.js` and `xlsx.js` replace all of it in about 250 lines.

---

## Environment variables

Copy `.env.local` (not committed) and fill in:

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL. Also derives the allowed image and CSP origins. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Used by every server-side query. Never expose to the client. |
| `ADMIN_JWT_SECRET` | Yes | Signs the admin session cookie (`admin_token`). |
| `VOTER_JWT_SECRET` | Yes | Signs the voter session cookie (`voter_token`). |
| `NEXT_PUBLIC_SITE_URL` | Recommended | Canonical origin, for absolute metadata URLs. |
| `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` | Optional | Server and client error reporting. Set both to the same DSN. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No | Unused by app code. Kept only so Supabase RLS has something to deny. |

---

## Running locally

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint     # ESLint
npm test         # node:test suite
npm run build    # production build
```

Voter flow starts at `/`; the admin portal is at `/admin/login`.

---

## Database setup

Migrations live in `migrations/`, numbered and paired as `*.up.sql` / `*.down.sql`. There is no migration runner — run each `.up.sql` in order via the Supabase SQL Editor or `psql`.

**Migrating an existing database:** `migrations/APPLY_0006_TO_0011.sql` bundles `0006`–`0011` into one atomic, idempotent, self-verifying script. It ends with a check that raises (and therefore rolls the whole thing back) if any expected column or function is missing. Prefer it over running the files individually.

> `0006` creates a unique index on `voters.voter_phone`. If that column already carries a `UNIQUE` constraint the statement is a harmless no-op. If you have restored from a dump that predates the constraint, check for duplicates first, since the index would otherwise fail:
> ```sql
> select voter_phone, count(*) from voters group by voter_phone having count(*) > 1;
> ```

Expected schema (defined in Supabase, outside this repo):

- `constituencies` (`id`, `name`, `region`, `code`)
- `candidates` (`id`, `full_name`, `constituency_id`, `photo_url`, `is_active`)
- `voters` (`id`, `full_name`, `voter_dob`, `voter_phone`, `constituency_id`, `has_voted`, + `registered_at`, `is_verified`, `verification_method` from `0007`)
- `votes` (`id`, `candidate_id`, `constituency_id`, `voted_at`) — no voter reference, by design
- `election_settings` (single row: `id`, `election_name`, `is_active`, `voting_opens_at`, `voting_closes_at`, + `description` from `0011`, `results_published_at` from `0015`)
- `admins` (`id`, `email`, `password_hash`, `role`) — bcrypt hashes, created manually
- `admin_audit_log` (from `0005`, extended by `0010`)
- `rate_limit_counters` (from `0013`) — sliding-window counters; safe to truncate, which resets all limits

Create an administrator:

```js
require('bcryptjs').hashSync('the-password', 12)
```

Seed constituencies via **Admin → Constituencies → Import CSV** (`name,region,code`), then add candidates.

---

## Security posture

Implemented in this codebase:

| Area | Control |
|---|---|
| Ballot integrity | All eligibility checks inside the writing transaction (`0008`); `has_voted` is the concurrency gate |
| Ballot secrecy | No voter reference on `votes`, enforced by schema |
| Authentication | httpOnly, `Secure`, `SameSite` session cookies; admin cookie is `SameSite=Strict` |
| Authorization | `proxy.js` gates `/admin` and `/api/admin/*` before any handler runs |
| Brute force | Two-dimensional rate limits — generous per IP (Ghanaian carrier NAT), tight per phone number / per admin account. Counters live in Postgres (`0013`) and fail **closed**. |
| Enumeration | Identical responses and constant-time bcrypt comparison for unknown vs. wrong credentials |
| CSRF | `SameSite` cookies plus an explicit `Origin` check on every mutation |
| XSS | Nonce-based CSP with `strict-dynamic` in production; React escaping throughout |
| SQL injection | Parameterised queries only; UUID and format validation on every identifier |
| IDOR | Voter identity comes only from the signed cookie, never the request body |
| Mass assignment | Explicit field allowlists on update endpoints |
| File upload | Magic-number verification, not the client-declared MIME type; photo URLs pinned to our own Storage bucket |
| Spreadsheet injection | Formula-triggering CSV cells prefixed to force text interpretation |
| Audit | Sign-ins (including failures), voting open/close, candidate changes, settings changes and every report export |
| Transport | HSTS, `X-Frame-Options: DENY`, `nosniff`, restrictive `Permissions-Policy` |

---

## Deploying

1. Run every migration in `migrations/` against the production project, oldest first.
2. Set every environment variable above in the hosting platform, not just `.env.local`.
3. Confirm Supabase Row Level Security **denies** the `anon` and `authenticated` roles on every table. The app never relies on RLS (it uses the service-role key), but RLS is what stops someone calling the Supabase REST API directly with the public anon key.
4. Create the `candidate-photos` Storage bucket, public-read.
5. Verify after deploy:
   - `curl -I https://your-domain/` shows `content-security-policy` with a `nonce-`, plus HSTS
   - `/admin` redirects to `/admin/login`
   - `/api/admin/stats` returns 401 unauthenticated

---

## Known limitations before a national deployment

These are design-level and cannot be closed from inside this codebase alone. They are listed in priority order.

1. **Voter authentication is phone number + date of birth.** Date of birth inside the 18–35 window is roughly 6,600 possibilities and is often publicly known. Rate limiting caps an attacker at 8 attempts per number per day, which makes bulk attack impractical but does not protect a specifically targeted voter. **SMS one-time passcodes are the correct fix**; `voters.verification_method` already exists to record it.
2. **Registration is self-service and unverified.** Nothing binds a registration to a real person, so one individual with several SIM cards can register several times. Integration with the National Identification Authority (Ghana Card) is the real answer.
3. **Constituency is self-declared.** A voter can register in a constituency they have no connection to.
4. **No published verifiability.** Voters cannot confirm their ballot was counted. End-to-end verifiable schemes (a ballot tracker, published encrypted tallies) are a substantial addition and worth scoping if the platform is used for binding elections.
5. **`sharp` advisories.** Three high-severity advisories remain in Next.js's bundled image optimizer. The only fix npm offers downgrades Next to 9.3.3, which is not viable; track upstream Next releases instead.
6. **No automated database backups configured here.** Enable Supabase point-in-time recovery, and take a manual snapshot immediately before opening and after closing the poll.
7. **Admin accounts have no second factor and no roles.** The `admins.role` column exists but nothing reads it — every administrator can do everything, including closing voting.
