import { redirect } from 'next/navigation'

/**
 * `/vote` used to be the registration form, which made the information
 * architecture confusing: the route named "vote" was the one place you could
 * not vote, and `/vote/candidates` — the actual ballot — read as a subsection
 * of registration.
 *
 * Registration now lives at `/register`. This redirect keeps any link, QR code
 * or printed material already pointing at `/vote` working.
 */
export default function VoteRedirect() {
    redirect('/register')
}
