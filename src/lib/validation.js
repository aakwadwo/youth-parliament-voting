const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const GHANA_PHONE_RE = /^0[0-9]{9}$/
const NAME_RE = /^[a-zA-ZÀ-ſ' -]{2,100}$/

export function isUUID(value) {
    return typeof value === 'string' && UUID_RE.test(value)
}

export function isValidGhanaPhone(value) {
    return typeof value === 'string' && GHANA_PHONE_RE.test(value.trim())
}

export function isValidName(value) {
    return typeof value === 'string' && NAME_RE.test(value.trim())
}

export function isValidDateString(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
    const date = new Date(value)
    return !Number.isNaN(date.getTime())
}

// Exact calendar-based age, not a 365.25-day approximation.
export function calculateAge(dobString) {
    const dob = new Date(dobString)
    const now = new Date()
    let age = now.getFullYear() - dob.getFullYear()
    const monthDiff = now.getMonth() - dob.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
        age--
    }
    return age
}

export function isEligibleAge(dobString) {
    if (!isValidDateString(dobString)) return false
    const dob = new Date(dobString)
    if (dob.getTime() > Date.now()) return false
    const age = calculateAge(dobString)
    return age >= 18 && age <= 35
}
