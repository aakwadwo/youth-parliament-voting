import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { ELECTION_STATUS, isVotingOpen } from '@/lib/election-status'

/**
 * Routes that lead to a ballot must decide on the server whether voting is
 * open, before any markup is sent.
 *
 * This is a source-level test because that is where the property lives. A
 * client component cannot guard a route — by the time it runs the page is
 * already in the browser — so the defect these tests exist to prevent is not a
 * wrong return value, it is a route being written the wrong way round.
 *
 * The regression: `/login` was a `'use client'` page that rendered a working
 * sign-in form whatever the election was doing, and only told a voter the poll
 * had closed after they had entered their mobile number and date of birth and
 * pressed the button. It mattered because `/vote/candidates` redirects to
 * `/login` whenever there is no voter session, so every latecomer following an
 * old ballot link was routed into a form that could never work — and asked for
 * personal data on the way.
 */

const ROOT = path.join(import.meta.dirname, '..')
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')

/** Every route a voter can reach that must not be offered outside the poll. */
const GUARDED_ROUTES = ['src/app/login/page.jsx', 'src/app/vote/candidates/page.jsx']

for (const route of GUARDED_ROUTES) {
    test(`${route} guards on the server, not in the browser`, () => {
        const source = read(route)

        assert.equal(
            /^\s*['"]use client['"]/.test(source),
            false,
            `${route} is a client component, so it cannot refuse a request before the page is sent`
        )
        assert.match(
            source,
            /readElection/,
            `${route} does not read the election state, so it cannot know whether voting is open`
        )
        assert.match(
            source,
            /isVotingOpen|VotingNotOpen/,
            `${route} reads the election but never acts on it`
        )
    })
}

test('the sign-in route refuses every state except an open poll', () => {
    // The guard's condition, stated once here so a future edit that inverts it
    // fails rather than silently reopening sign-in on a closed election.
    assert.equal(isVotingOpen(ELECTION_STATUS.OPEN), true)
    for (const status of [
        ELECTION_STATUS.SCHEDULED,
        ELECTION_STATUS.ENDED,
        ELECTION_STATUS.CLOSED,
        undefined,
    ]) {
        assert.equal(isVotingOpen(status), false, `sign-in would be offered while ${status}`)
    }
})

test('the sign-in form survives as its own client component', () => {
    // The form still has to be a client component, and it still has to handle
    // the poll closing between page load and submit — the guard cannot catch
    // that race, only the API can.
    const form = read('src/app/login/LoginForm.jsx')
    assert.match(form, /^\s*['"]use client['"]/)
    assert.match(form, /ELECTION_CLOSED_CODES/, 'the mid-session close race is no longer handled')
})
