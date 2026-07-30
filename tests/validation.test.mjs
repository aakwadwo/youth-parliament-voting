import test from 'node:test'
import assert from 'node:assert/strict'

import {
    isUUID,
    isValidGhanaPhone,
    normalisePhone,
    isValidName,
    normaliseName,
    isValidDateString,
    calculateAge,
    checkAgeEligibility,
    dobBounds,
    MIN_AGE,
    MAX_AGE,
} from '@/lib/validation'

test('isUUID accepts v4 UUIDs and rejects everything else', () => {
    assert.ok(isUUID('3f2504e0-4f89-41d3-9a0c-0305e82c3301'))
    assert.ok(isUUID('3F2504E0-4F89-41D3-9A0C-0305E82C3301'))
    assert.ok(!isUUID('3f2504e0-4f89-41d3-9a0c-0305e82c330'))
    assert.ok(!isUUID("3f2504e0-4f89-41d3-9a0c-0305e82c3301' OR '1'='1"))
    assert.ok(!isUUID(''))
    assert.ok(!isUUID(null))
    assert.ok(!isUUID(undefined))
})

test('Ghana phone numbers accept real formats and reject the rest', () => {
    for (const valid of ['0241234567', '024 123 4567', '024-123-4567', '0201234567', '0501234567']) {
        assert.ok(isValidGhanaPhone(valid), `${valid} should be valid`)
    }
    for (const invalid of [
        '241234567', // no leading zero
        '02412345678', // too long
        '024123456', // too short
        '0141234567', // not a mobile prefix
        '+233241234567', // international format not accepted
        'not-a-number',
        '',
        null,
    ]) {
        assert.ok(!isValidGhanaPhone(invalid), `${invalid} should be invalid`)
    }
})

test('normalisePhone strips the separators people type', () => {
    assert.equal(normalisePhone('024 123 4567'), '0241234567')
    assert.equal(normalisePhone('024-123-4567'), '0241234567')
    assert.equal(normalisePhone(null), '')
})

test('names accept West African forms and reject injection payloads', () => {
    for (const valid of [
        'Kwame Mensah',
        'Ámá Owusu',
        "N'Dri Kouassi",
        'Kofi Owusu-Ansah',
        'Nana Akufo Addo',
        'J. Mahama',
        'Yaa Asantewaa Boakye',
    ]) {
        assert.ok(isValidName(valid), `${valid} should be valid`)
    }

    for (const invalid of [
        '', // empty
        'X', // single character
        '<script>alert(1)</script>',
        'Robert"); DROP TABLE voters;--',
        '=HYPERLINK("https://evil.example")',
        'Kwame123',
        '   ',
        null,
    ]) {
        assert.ok(!isValidName(invalid), `${JSON.stringify(invalid)} should be invalid`)
    }
})

test('normaliseName collapses whitespace', () => {
    assert.equal(normaliseName('  Kwame   Mensah  '), 'Kwame Mensah')
})

test('isValidDateString rejects impossible calendar dates', () => {
    assert.ok(isValidDateString('2000-02-29')) // 2000 was a leap year
    assert.ok(!isValidDateString('2001-02-29')) // 2001 was not
    assert.ok(!isValidDateString('2001-02-30'))
    assert.ok(!isValidDateString('2001-13-01'))
    assert.ok(!isValidDateString('01-01-2001'))
    assert.ok(!isValidDateString(''))
})

test('calculateAge uses calendar years, not a 365.25-day approximation', () => {
    const now = new Date('2026-07-30T12:00:00Z')
    // Birthday already passed this year
    assert.equal(calculateAge('2000-01-15', now), 26)
    // Birthday is today
    assert.equal(calculateAge('2000-07-30', now), 26)
    // Birthday is tomorrow — still the younger age
    assert.equal(calculateAge('2000-07-31', now), 25)
    // Leap-day birthday in a non-leap year
    assert.equal(calculateAge('2000-02-29', now), 26)
})

test('age eligibility covers both boundaries inclusively', () => {
    const now = new Date('2026-07-30T12:00:00Z')

    // Exactly MIN_AGE today
    assert.equal(checkAgeEligibility('2008-07-30', now).valid, true)
    // One day short of MIN_AGE
    const tooYoung = checkAgeEligibility('2008-07-31', now)
    assert.equal(tooYoung.valid, false)
    assert.match(tooYoung.message, new RegExp(String(MIN_AGE)))

    // Exactly MAX_AGE today — still eligible
    assert.equal(checkAgeEligibility('1991-07-30', now).valid, true)
    // The day after turning MAX_AGE + 1
    const tooOld = checkAgeEligibility('1990-07-29', now)
    assert.equal(tooOld.valid, false)
    assert.match(tooOld.message, new RegExp(String(MAX_AGE)))
})

test('age eligibility rejects future and malformed dates', () => {
    const now = new Date('2026-07-30T12:00:00Z')
    const future = checkAgeEligibility('2030-01-01', now)
    assert.equal(future.valid, false)
    assert.match(future.message, /future/i)

    assert.equal(checkAgeEligibility('not-a-date', now).valid, false)
    assert.equal(checkAgeEligibility('', now).valid, false)
})

test('dobBounds only spans dates that are actually eligible', () => {
    const now = new Date('2026-07-30T12:00:00Z')
    const { min, max } = dobBounds(now)

    // Both endpoints must themselves be eligible, or the native date picker
    // would offer a value the server then rejects.
    assert.equal(checkAgeEligibility(max, now).valid, true, `max ${max} should be eligible`)
    assert.equal(checkAgeEligibility(min, now).valid, true, `min ${min} should be eligible`)

    // And one day outside either end must not be.
    const dayAfter = (iso) => {
        const d = new Date(`${iso}T00:00:00Z`)
        d.setUTCDate(d.getUTCDate() + 1)
        return d.toISOString().slice(0, 10)
    }
    const dayBefore = (iso) => {
        const d = new Date(`${iso}T00:00:00Z`)
        d.setUTCDate(d.getUTCDate() - 1)
        return d.toISOString().slice(0, 10)
    }

    assert.equal(checkAgeEligibility(dayAfter(max), now).valid, false)
    assert.equal(checkAgeEligibility(dayBefore(min), now).valid, false)
})
