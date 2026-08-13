import { createAdminClient } from '@/lib/supabase-admin'

/**
 * The constituency list, read once and shared by everything that needs it.
 *
 * ── Why this is its own module ──────────────────────────────────────────────
 *
 * `/register` and `/api/constituencies` both need exactly these columns in
 * exactly this order. They used to be two copies of the same query in two
 * files, which is how the picker on the registration form and the picker
 * anywhere else end up disagreeing about what a constituency is called or what
 * order they come in. The order matters more than it looks: the combobox ranks
 * prefix matches above substring matches and then relies on the incoming order
 * to break ties, so "sorted by name" is part of the search behaviour, not a
 * presentational detail.
 *
 * ── Why the registration page reads this on the server ──────────────────────
 *
 * It used to be fetched from the browser in a `useEffect` after hydration. That
 * put the whole list behind a waterfall — HTML, then the JavaScript bundle,
 * then hydration, then a second HTTP round trip to a serverless function that
 * might be cold — before the picker could show anything but "Loading
 * constituencies…". The query itself takes 3–5ms; everything else in that chain
 * was the wait. Read here, the list arrives with the markup and the picker is
 * usable on first paint.
 *
 * `select` is an explicit column list, never `*`: `constituencies` also carries
 * `code`, which is the conflict target the CSV import upserts on and is of no
 * use to a voter.
 *
 * @param {object} [client] - injectable Supabase client, for tests
 * @returns {Promise<{ constituencies: Array, error: object|null }>}
 *   Returns rather than throws, because both callers have to decide for
 *   themselves what to do with a failure: the API route answers with a 500, and
 *   the registration page still has to render a usable form.
 */
export async function readConstituencies(client) {
    const supabase = client ?? createAdminClient()

    const { data, error } = await supabase
        .from('constituencies')
        .select('id, name, region')
        .order('name')

    if (error) return { constituencies: [], error }

    return { constituencies: data ?? [], error: null }
}
