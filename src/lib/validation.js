/**
 * Validation shared by the browser and the API routes.
 *
 * Both sides import from here so a voter can never be accepted by the form and
 * then rejected by the server with a differently worded message. The two used
 * to disagree: the form computed age from a 365.25-day approximation while the
 * server used a calendar year, so people born on certain days were told they
 * were eligible and then told they were not.
 *
 * Client-side validation is purely a courtesy to the voter. Every rule here is
 * enforced again server-side, where it cannot be bypassed.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Ghanaian mobile numbers in national format: 0, then a mobile prefix digit,
// then eight more digits.
const GHANA_PHONE_RE = /^0[235][0-9]{8}$/

// Latin letters with the accents used across Ghanaian and other West African
// names, plus the apostrophes, hyphens and periods that legitimately appear in
// them. Deliberately excludes digits and every character that carries meaning
// in HTML, SQL or a spreadsheet formula.
const NAME_RE = /^[\p{L}][\p{L}\p{M}'’.\- ]{1,99}$/u

export const MIN_AGE = 18
export const MAX_AGE = 35

export function isUUID(value) {
    return typeof value === 'string' && UUID_RE.test(value)
}

// Ghana's country code, however a voter writes it: "+233", "00233" or a bare
// "233", followed by the nine-digit subscriber number.
const INTERNATIONAL_PREFIX = /^(?:\+|00)?233(\d{9})$/

/**
 * Accepts the spacing people actually type, e.g. "024 123 4567", and the
 * international form, e.g. "+233 24 123 4567".
 *
 * The international branch is not a new format being allowed onto the register:
 * +233 24 123 4567 and 024 123 4567 are the same handset, and the register only
 * ever stores the national form. Without it, a voter whose keyboard or contacts
 * autofill supplies the international form — the way a number is saved on most
 * phones — was refused at sign-in for a number that is genuinely registered.
 *
 * Collapsing both forms to one string also means the unique index on
 * voter_phone sees them as the same number, so this cannot be used to register
 * one handset twice.
 */
export function normalisePhone(value) {
    if (typeof value !== 'string') return ''

    // Brackets and dots as well as spaces and hyphens: "(024) 123-4567" and
    // "024.123.4567" are both numbers people write down.
    const compact = value.replace(/[\s\-().]/g, '')

    const international = INTERNATIONAL_PREFIX.exec(compact)
    return international ? `0${international[1]}` : compact
}

export function isValidGhanaPhone(value) {
    return GHANA_PHONE_RE.test(normalisePhone(value))
}

export function normaliseName(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

export function isValidName(value) {
    return NAME_RE.test(normaliseName(value))
}

export function isValidDateString(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    // Date parsing alone accepts impossible dates such as 2001-02-30 by rolling
    // them into the next month, so the parsed value is compared back.
    const [y, m, d] = value.split('-').map(Number)
    const date = new Date(Date.UTC(y, m - 1, d))
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

/**
 * Builds `YYYY-MM-DD` from three separately-entered parts.
 *
 * Exists because `<input type="date">` renders in the *browser's* locale, not
 * the site's. A phone set to en-US shows the same control as MM/DD/YYYY that a
 * phone set to en-GB shows as DD/MM/YYYY, and the app is given no say in it and
 * no way to detect it. A voter entering 31/03/2000 into a month-first control
 * does not get an error — the segmented editor clamps 31 into the month box to
 * 12 — so the field silently yields 2000-12-03 and the voter is told, with
 * complete confidence, that their registration does not exist.
 *
 * Taking day, month and year separately removes the ambiguity at the source:
 * each part is labelled, so there is no order to misread.
 *
 * Returns '' rather than a partial or rolled-over date. Never hands back a date
 * the parts do not literally describe: `isValidDateString` rejects 31 February
 * instead of letting it become 3 March, which on this form would mean signing a
 * voter in against a date they did not type.
 */
export function composeDateString(year, month, day) {
    const y = String(year ?? '').trim()
    const m = String(month ?? '').trim()
    const d = String(day ?? '').trim()

    if (!/^\d{4}$/.test(y) || !/^\d{1,2}$/.test(m) || !/^\d{1,2}$/.test(d)) return ''

    const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    return isValidDateString(iso) ? iso : ''
}

/** Exact calendar age, not a 365.25-day approximation. */
export function calculateAge(dobString, now = new Date()) {
    const [y, m, d] = dobString.split('-').map(Number)
    let age = now.getFullYear() - y
    const monthDiff = now.getMonth() + 1 - m
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d)) {
        age--
    }
    return age
}

/**
 * Eligibility with the reason attached.
 *
 * Returning the message alongside the verdict keeps the form and the API from
 * drifting apart, and tells the voter which rule they failed rather than a
 * generic "invalid date of birth".
 */
export function checkAgeEligibility(dobString, now = new Date()) {
    if (!isValidDateString(dobString)) {
        return { valid: false, message: 'Please enter a valid date of birth.' }
    }

    const [y, m, d] = dobString.split('-').map(Number)
    if (new Date(Date.UTC(y, m - 1, d)).getTime() > now.getTime()) {
        return { valid: false, message: 'Your date of birth cannot be in the future.' }
    }

    const age = calculateAge(dobString, now)

    if (age < MIN_AGE) {
        return {
            valid: false,
            age,
            message: `You must be at least ${MIN_AGE} years old to vote in this election.`,
        }
    }
    if (age > MAX_AGE) {
        return {
            valid: false,
            age,
            message: `The Youth Parliament is open to voters aged ${MIN_AGE} to ${MAX_AGE}.`,
        }
    }

    return { valid: true, age }
}

export function isEligibleAge(dobString, now = new Date()) {
    return checkAgeEligibility(dobString, now).valid
}

/**
 * `min`/`max` bounds for the date-of-birth input, so the native mobile date
 * picker cannot offer an ineligible year in the first place.
 */
export function dobBounds(now = new Date()) {
    const iso = (dt) => dt.toISOString().slice(0, 10)

    const max = new Date(now)
    max.setFullYear(max.getFullYear() - MIN_AGE)

    const min = new Date(now)
    min.setFullYear(min.getFullYear() - MAX_AGE - 1)
    min.setDate(min.getDate() + 1)

    return { min: iso(min), max: iso(max) }
}
