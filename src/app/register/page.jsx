import RegisterForm from './RegisterForm'
import { readConstituencies } from '@/lib/constituencies-server'

/**
 * The registration route.
 *
 * A server component whose only job is to have the constituency list in hand
 * before any markup is sent, so the picker on the form below is usable on first
 * paint. The form itself is still a client component — it holds field state, a
 * submission and a confirmation screen — and it is unchanged apart from
 * receiving the list as a prop instead of fetching it.
 *
 * ── What this deliberately does NOT do ──────────────────────────────────────
 *
 * It does not gate on the voting window, and it must never start to. The
 * register has to be open before the poll — that is the point of a registration
 * period — and closing it when voting ends turns a late arrival into an error
 * rather than an explanation. `/api/register` is deliberately ungated for the
 * same reason, and the election state that decides what a voter is offered
 * *next* travels back in the registration response. This is the difference
 * between this route and `/login` and `/vote/candidates`, both of which are
 * server-guarded on the poll being open.
 *
 * It also reads nothing about any voter. The only query here is the public
 * constituency list.
 */

// Deliberately no `metadata` export. This page never had a title override and
// inherits `title.default` from the root layout; adding one here would rename
// the tab, which is not what this change is for.

export default async function RegisterPage() {
    const { constituencies, error } = await readConstituencies()

    // A failed read does not withhold the form. Every other field is still
    // fillable, the message says what is wrong, and the server would refuse a
    // submission with no constituency anyway — which is a better outcome than
    // an error page for a voter who has come to register.
    return (
        <RegisterForm
            constituencies={constituencies}
            constituenciesError={
                error ? 'We could not load the list of constituencies just now.' : ''
            }
        />
    )
}
