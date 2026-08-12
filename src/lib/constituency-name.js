import { normaliseName } from '@/lib/validation'

/**
 * The rules for a constituency's name.
 *
 * Kept out of the route so they can be unit tested — the route imports
 * `next/server` and cannot be loaded by the plain-Node test runner, and a rule
 * that decides whether an administrator can correct the register should not be
 * the part with no coverage.
 *
 * ── Why isValidName() is not used here ───────────────────────────────────────
 *
 * That rule is for a person's name. It rejects the punctuation real Ghanaian
 * constituencies carry: this register already contains "Nalerigu/Gambaga", and
 * the CSV import's own example row is "Sekondi, Takoradi". Applying it would
 * refuse to save names the platform is currently serving, which is the worst
 * kind of validation — the sort that only fires on correct data.
 *
 * The rule the existing POST route applies is "a non-empty string". That is
 * preserved exactly, with a length bound added, because this value now arrives
 * from a free-text field rather than a CSV column.
 */

/** Long enough for the longest real name several times over. */
export const MAX_CONSTITUENCY_NAME_LENGTH = 120

/**
 * @returns {string|null} the message to show, or null when the name is usable
 */
export function validateConstituencyName(value) {
    if (typeof value !== 'string') return 'A constituency name is required.'

    const name = normaliseName(value)
    if (!name) return 'A constituency name is required.'
    if (name.length > MAX_CONSTITUENCY_NAME_LENGTH) {
        return `A constituency name cannot be longer than ${MAX_CONSTITUENCY_NAME_LENGTH} characters.`
    }

    return null
}

/**
 * Escapes a value used as a LIKE/ILIKE pattern.
 *
 * The duplicate-name check compares case-insensitively with ILIKE, where `%`
 * and `_` are wildcards. Without this, a name containing one would match rows
 * it should not and refuse a rename that is perfectly valid.
 */
export function escapeLikePattern(value) {
    return String(value).replace(/([\\%_])/g, '\\$1')
}
