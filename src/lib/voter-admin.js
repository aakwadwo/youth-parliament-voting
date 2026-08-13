import { isUUID, normalisePhone, isValidGhanaPhone } from '@/lib/validation'

/**
 * The rules governing what an administrator may see of a voter, and what they
 * may change.
 *
 * ── Why this is a separate module ───────────────────────────────────────────
 *
 * The two routes that use it import `next/server` and a service-role client, so
 * they cannot be loaded by the plain-Node test runner. These rules decide
 * whether a voter's date of birth reaches a browser and whether an "edit
 * constituency" request can be talked into writing something else, which makes
 * them the last thing in the feature that should go untested. Same reasoning as
 * `constituency-name.js`.
 *
 * ── The shape of the guarantee ──────────────────────────────────────────────
 *
 * Both functions below are allow-lists that construct their output explicitly.
 * Neither spreads its input. That is deliberate: a projection written as
 * `{ ...voter, voter_dob: undefined }` leaks every column added to the table
 * afterwards, and an update built by copying a request body writes every key an
 * attacker chooses to send. Written this way, "what can an administrator see?"
 * and "what can an administrator write?" are each answerable by reading one
 * object literal.
 */

/**
 * Everything the search endpoint is permitted to return about a voter.
 *
 * Anything not on this list does not leave the server. Two omissions are
 * load-bearing rather than incidental:
 *
 *   voter_dob    Date of birth plus phone number *is* the voter's credential
 *                (`/api/login` authenticates on exactly that pair). Rendering
 *                it on an admin screen would mean a shoulder-surfed session, a
 *                screenshot in a support thread or a browser cache on a shared
 *                machine hands over the ability to sign in as that voter and
 *                cast their ballot. There is no administrative task that needs
 *                it: the administrator is confirming a person, not
 *                authenticating them.
 *
 *   voter_phone  The administrator supplied the number to find the row, so
 *                echoing it back adds nothing and puts it in one more place —
 *                a response body, a browser cache, an error report. A masked
 *                form is returned instead, which is enough to confirm the right
 *                record was found.
 */
export const ADMIN_VOTER_COLUMNS =
    'id, full_name, voter_phone, constituency_id, registered_at, has_voted, is_verified, constituencies(name)'

/**
 * Hides all but the last three digits of a phone number.
 *
 * Three is enough for an administrator to confirm the row matches the number
 * they were just given over the phone, and too few to be worth harvesting. The
 * mask keeps the original length so a mistyped number is visibly the wrong
 * shape.
 */
export function maskPhone(phone) {
    const digits = normalisePhone(phone)
    if (!digits) return ''
    if (digits.length <= 3) return '•'.repeat(digits.length)
    return '•'.repeat(digits.length - 3) + digits.slice(-3)
}

/**
 * The one object shape an administrator ever receives for a voter.
 *
 * @param {object} row - a `voters` row selected with ADMIN_VOTER_COLUMNS
 */
export function toAdminVoterView(row) {
    if (!row) return null

    return {
        id: row.id,
        full_name: row.full_name,
        phone_masked: maskPhone(row.voter_phone),
        constituency_id: row.constituency_id,
        constituency_name: row.constituencies?.name ?? null,
        registered_at: row.registered_at,
        has_voted: row.has_voted === true,
        is_verified: row.is_verified === true,
    }
}

/**
 * Validates a search term.
 *
 * Exact phone match only, and deliberately so. A name search over a register of
 * this size is a browsable electoral roll, which is the one thing the admin
 * portal has been careful not to become — `registration-report.js` computes
 * every figure it shows from Postgres-side aggregates precisely so that no row
 * describing a person is ever within reach of a widened query. A voter ringing
 * the Commission to correct their constituency has their phone number; it is
 * the credential they sign in with. It is also a unique index, so the lookup
 * returns at most one row by construction rather than by a LIMIT clause.
 *
 * @returns {{ phone: string }|{ error: string }}
 */
export function parseVoterSearch(rawPhone) {
    if (typeof rawPhone !== 'string' || !rawPhone.trim()) {
        return { error: 'Enter the voter’s phone number.' }
    }

    const phone = normalisePhone(rawPhone)

    if (!isValidGhanaPhone(phone)) {
        return { error: 'Enter a valid Ghana mobile number, for example 024 123 4567.' }
    }

    return { phone }
}

/**
 * The single field this feature may write, extracted from a request body.
 *
 * Rejects a body carrying any other key rather than ignoring it. Silently
 * dropping unexpected keys would mean a request that tried to set `has_voted`
 * got a 200 and an administrator who believed they had done something they had
 * not; refusing says plainly that this endpoint writes one column.
 *
 * @returns {{ constituencyId: string }|{ error: string }}
 */
export function pickConstituencyUpdate(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return { error: 'Invalid request body.' }
    }

    const keys = Object.keys(body)
    const unexpected = keys.filter((key) => key !== 'constituency_id')

    if (unexpected.length > 0) {
        return {
            error: `This request may only change constituency_id. Unexpected: ${unexpected.join(', ')}.`,
        }
    }

    if (!isUUID(body.constituency_id)) {
        return { error: 'Select a valid constituency.' }
    }

    return { constituencyId: body.constituency_id }
}

/**
 * The audit entry's payload for a constituency correction.
 *
 * Carries ids and constituency names and NOTHING about the person. The audit
 * log is served wholesale by `/api/admin/audit-log` and rendered in the
 * Settings section, so a name or a number in `details` would turn a log viewer
 * into the register browser this feature was designed not to be — and would
 * make the audit trail itself a retention liability. `voter_id` is sufficient
 * for anyone with database access, which is the right amount of friction.
 */
export function constituencyChangeAudit({ voterId, before, after }) {
    return {
        entity: 'voter',
        voter_id: voterId,
        previous: {
            constituency_id: before.constituency_id,
            constituency_name: before.constituency_name ?? null,
        },
        next: {
            constituency_id: after.constituency_id,
            constituency_name: after.constituency_name ?? null,
        },
    }
}
