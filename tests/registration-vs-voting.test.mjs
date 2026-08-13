import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * The architectural boundary between registering and voting.
 *
 * Registration is throttled per device. Voting is not, and must never become
 * so: a voter registered on a borrowed phone has to be able to sign in and cast
 * a ballot from anywhere, and several registered voters have to be able to use
 * one device one after another. The two concerns share no state, and this file
 * exists to make that separation something a change has to break loudly rather
 * than quietly.
 *
 * These are static assertions over the source, not behavioural tests of a
 * running route — the routes import `next/server` and a service-role client and
 * cannot be exercised in a plain Node test process. They are precise about what
 * they check: that the voting path contains no reference to the device
 * machinery, and that the mechanisms which actually enforce one-person-one-vote
 * are still present and still shaped the way they were reviewed. The behaviour
 * of the device windows themselves is covered in device-registration.test.mjs.
 */

const ROOT = process.cwd()
const read = (...parts) => readFileSync(path.join(ROOT, ...parts), 'utf8')

const LOGIN_ROUTE = read('src', 'app', 'api', 'login', 'route.js')
const VOTE_ROUTE = read('src', 'app', 'api', 'vote', 'route.js')
const BALLOT_PAGE = read('src', 'app', 'vote', 'candidates', 'page.jsx')
const BALLOT = read('src', 'app', 'vote', 'candidates', 'Ballot.jsx')
const LOGIN_PAGE = read('src', 'app', 'login', 'page.jsx')
const LOGIN_FORM = read('src', 'app', 'login', 'LoginForm.jsx')
const VOTER_SESSION = read('src', 'lib', 'voter-session.js')
const REGISTER_ROUTE = read('src', 'app', 'api', 'register', 'route.js')
const CAST_VOTE = read('migrations', '0008_harden_cast_vote.up.sql')

/** Anything that would couple a code path to the device machinery. */
const DEVICE_COUPLING =
    /device-registration|registration_events|registration_devices|checkDeviceEligibility|recordDeviceRegistration|DEVICE_COOKIE|device_id|deviceTokenHash|environmentHash/

const VOTING_PATH = {
    'api/login/route.js': LOGIN_ROUTE,
    'api/vote/route.js': VOTE_ROUTE,
    'vote/candidates/page.jsx': BALLOT_PAGE,
    'vote/candidates/Ballot.jsx': BALLOT,
    'login/page.jsx': LOGIN_PAGE,
    'login/LoginForm.jsx': LOGIN_FORM,
    'lib/voter-session.js': VOTER_SESSION,
}

// ── 9 & 10. No device restriction on signing in or voting ────────────────────

test('9/10. nothing in the sign-in or voting path touches the device machinery', () => {
    for (const [name, source] of Object.entries(VOTING_PATH)) {
        assert.ok(
            !DEVICE_COUPLING.test(source),
            `${name} must not reference the registration-device machinery`
        )
    }
})

test('the only place the device machinery is used is the registration route', () => {
    const users = []
    const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) {
                walk(full)
            } else if (/\.(js|jsx)$/.test(entry.name)) {
                if (readFileSync(full, 'utf8').includes('@/lib/device-registration')) {
                    users.push(path.relative(ROOT, full))
                }
            }
        }
    }
    walk(path.join(ROOT, 'src'))

    assert.deepEqual(users, [path.join('src', 'app', 'api', 'register', 'route.js')])
})

test('the vote route derives identity from the session cookie alone', () => {
    // A client-supplied voter id would let anyone vote as anyone else, and a
    // device signal would tie a ballot to hardware. Neither appears: the only
    // input the route accepts from the body is a candidate id.
    assert.match(VOTE_ROUTE, /getVoterIdFromRequest\(request\)/)
    assert.match(VOTE_ROUTE, /const \{ candidate_id \} = body/)

    // `voter_id` may appear only as the RPC parameter fed from the verified
    // session — never as something read out of the request body.
    const voterIdMentions = VOTE_ROUTE.match(/[\w.]*voter_id\w*/gi) ?? []
    assert.deepEqual(
        [...new Set(voterIdMentions)],
        ['p_voter_id'],
        'the only voter id in the vote route is the one the session proved'
    )
    assert.match(VOTE_ROUTE, /p_voter_id: voterId/)
})

// ── 11-15. One registered voter, one vote, from anywhere ─────────────────────

test('12/14/15. the one-vote rule is a database claim, not a cookie', () => {
    // Clearing cookies, opening a private window and switching device all
    // change what the browser holds and none of them change this: the flag
    // lives on the voter's row and is re-read inside the writing transaction.
    assert.match(CAST_VOTE, /select id, constituency_id, has_voted\s+into v_voter\s+from voters/)
    assert.match(CAST_VOTE, /if v_voter\.has_voted then\s+return query select false, 'already_voted'/)

    // The concurrency gate. Two simultaneous submissions both reach the update;
    // the predicate means exactly one of them changes a row.
    assert.match(
        CAST_VOTE,
        /update voters\s+set has_voted = true\s+where id = p_voter_id\s+and has_voted = false/
    )
    assert.match(CAST_VOTE, /if v_updated = 0 then\s+return query select false, 'already_voted'/)
})

test('12. a voter who has already voted is refused a new session', () => {
    // If login handed out a token to someone whose ballot is already cast, the
    // refusal would depend entirely on cast_vote() catching it. It does catch
    // it, but the session is withheld as well.
    assert.match(LOGIN_ROUTE, /if \(voter\.has_voted\) \{/)
    assert.match(LOGIN_ROUTE, /already_voted: true/)

    const alreadyVotedBranch = LOGIN_ROUTE.slice(
        LOGIN_ROUTE.indexOf('if (voter.has_voted)'),
        LOGIN_ROUTE.indexOf('const token = await signVoterToken')
    )
    assert.ok(
        !alreadyVotedBranch.includes('setVoterCookie'),
        'the already-voted branch must not issue a session'
    )
})

test('11. a cast ballot retires its own session, so the next voter starts clean', () => {
    // This is what lets several registered voters share one device on polling
    // day: the previous voter's credential is gone before the next one signs in.
    assert.match(VOTE_ROUTE, /NextResponse\.json\(\{ success: true \}\)[\s\S]*clearVoterCookie\(response\)/)
    assert.match(VOTE_ROUTE, /if \(outcome\?\.reason === 'already_voted'\) clearVoterCookie\(response\)/)
})

test('12. the ballot page refuses to render a second ballot', () => {
    assert.match(BALLOT_PAGE, /if \(voter\.has_voted\)/)
    assert.match(BALLOT_PAGE, /You have already voted/)
})

test('the voter session carries an identity and nothing else', () => {
    assert.match(VOTER_SESSION, /new SignJWT\(\{ voterId \}\)/)
    assert.ok(!DEVICE_COUPLING.test(VOTER_SESSION))
})

test('the constituency is taken from the voter record, never the request', () => {
    assert.match(CAST_VOTE, /p_constituency_id uuid default null\s+--\s*ignored/)
    assert.match(CAST_VOTE, /v_candidate\.constituency_id is distinct from v_voter\.constituency_id/)
})

test('voting remains gated on the election window inside the transaction', () => {
    for (const reason of ['voting_closed', 'voting_not_started', 'voting_ended']) {
        assert.ok(CAST_VOTE.includes(`'${reason}'`), `cast_vote must still return ${reason}`)
    }
    assert.match(VOTE_ROUTE, /requireVotingOpen\(\)/)
})

// ── 17. Ballot secrecy ───────────────────────────────────────────────────────

test('17. the ballot still carries no reference to the voter', () => {
    assert.match(
        CAST_VOTE,
        /insert into votes \(candidate_id, constituency_id, voted_at\)\s+values \(v_candidate\.id, v_voter\.constituency_id, now\(\)\)/
    )

    // No source anywhere may insert a voter id into votes.
    const dropped = read('migrations', '0002_remove_voter_id_from_votes.up.sql')
    assert.match(dropped, /drop column if exists voter_id/)
})

// ── Registration route ordering ──────────────────────────────────────────────

test('5/7. the device check sits after validation, and charges only a real registration', () => {
    // Call sites, not the import block at the top of the file.
    const deviceCheck = REGISTER_ROUTE.indexOf('await checkDeviceEligibility(')
    const insert = REGISTER_ROUTE.indexOf('.insert({')
    const record = REGISTER_ROUTE.indexOf('await recordDeviceRegistration(')
    const ageCheck = REGISTER_ROUTE.indexOf('checkAgeEligibility(voter_dob)')
    const phoneCheck = REGISTER_ROUTE.indexOf('isValidGhanaPhone(phone)')

    assert.ok(deviceCheck > 0 && insert > 0 && record > 0 && ageCheck > 0 && phoneCheck > 0)

    // The property that matters: a voter who mistyped their name, their number
    // or their date of birth is never even measured against the device
    // allowance, let alone charged for it.
    assert.ok(ageCheck < deviceCheck, 'age is validated before the device is consulted')
    assert.ok(phoneCheck < deviceCheck, 'the number is validated before the device is consulted')

    // And the allowance is spent only once a voter row actually exists, so a
    // registration that fails at the unique index costs the device nothing.
    assert.ok(deviceCheck < insert, 'eligibility is checked before the row is written')
    assert.ok(insert < record, 'a device is charged only after the voter row actually exists')
})

test('3. duplicate phone protection is unchanged', () => {
    // The friendly pre-SELECT that used to sit in front of the insert has been
    // removed: it could never prevent a duplicate — two concurrent requests can
    // both pass it — and the unique index is what actually does. What a caller
    // sees is identical, and that is what is asserted here.
    assert.match(REGISTER_ROUTE, /This phone number is already registered\. Please sign in instead\./)
    assert.match(REGISTER_ROUTE, /jsonError\(ALREADY_REGISTERED, 409, ERROR_CODES\.ALREADY_REGISTERED\)/)
    assert.match(REGISTER_ROUTE, /error\.code === PG_UNIQUE_VIOLATION/)

    // Exactly one refusal path now, and it is the one behind the constraint.
    assert.equal(
        REGISTER_ROUTE.match(/jsonError\(ALREADY_REGISTERED, 409/g).length,
        1,
        'the duplicate refusal should be stated once, on the 23505 handler'
    )

    // The pre-check must not come back: it is a round trip that decides nothing,
    // and it answered "is this number on the register?" before any other gate.
    assert.ok(
        !/\.from\('voters'\)\s*\.select\('id'\)\s*\.eq\('voter_phone'/.test(REGISTER_ROUTE),
        'the redundant duplicate-phone pre-check has been reintroduced'
    )

    // The constraint that does the actual work is still there.
    const index = read('migrations', '0006_add_performance_indexes.up.sql')
    assert.match(index, /create unique index if not exists voters_voter_phone_key\s+on voters \(voter_phone\)/)
})

test('the registration route makes no redundant reads of the voters table', () => {
    // One statement touches `voters`: the insert. If a second appears, the
    // round trip this change removed has grown back somewhere else.
    const voterReads = REGISTER_ROUTE.match(/\.from\('voters'\)/g) ?? []
    assert.equal(voterReads.length, 1, 'registration should touch `voters` exactly once')
    assert.match(REGISTER_ROUTE, /\.from\('voters'\)\s*\.insert\(\{/)
})

// ── 4 & 16. Nothing about the election itself moved ──────────────────────────

test('4. registration is still not gated on the election window', () => {
    // Deliberate existing behaviour: the register has to be open before the
    // poll, and a late arrival deserves an explanation rather than an error.
    assert.ok(
        !REGISTER_ROUTE.includes('requireVotingOpen'),
        'registration must not acquire an election-window gate'
    )
    // What the election state still decides is only whether a ballot session is
    // worth issuing.
    assert.match(REGISTER_ROUTE, /if \(!election \|\| isVotingOpen\(election\.status\)\) \{?\s*setVoterCookie/)
})

test('16. no migration in this change writes to the election schedule', () => {
    const migrations = readdirSync(path.join(ROOT, 'migrations')).filter((f) => f.startsWith('0016'))
    assert.equal(migrations.length, 2, 'an up and a down migration')

    for (const file of migrations) {
        const sql = read('migrations', file)
        assert.ok(!/election_settings/.test(sql), `${file} must not reference election_settings`)
        assert.ok(
            !/voting_opens_at|voting_closes_at|results_published_at|is_active|election_name/.test(sql),
            `${file} must not reference any election schedule column`
        )
    }
})

// ── 5. Thresholds stay out of voter-facing copy ──────────────────────────────

test('the policy numbers appear in no voter-facing page', () => {
    const offenders = []
    const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name)
            // The API routes are not voter-facing copy; everything else under
            // src/app renders to a page someone reads.
            if (entry.isDirectory()) {
                if (entry.name !== 'api') walk(full)
            } else if (/\.(js|jsx)$/.test(entry.name)) {
                const source = readFileSync(full, 'utf8')
                if (/REGISTRATION_DEVICE_LIMITS|registration_events/.test(source)) {
                    offenders.push(path.relative(ROOT, full))
                }
            }
        }
    }
    walk(path.join(ROOT, 'src', 'app'))

    assert.deepEqual(offenders, [], 'security thresholds must not reach a rendered page')
})

test('the terms no longer promise one registration per device', () => {
    const terms = read('src', 'app', 'terms', 'page.jsx')
    assert.ok(!/One device, one registration/i.test(terms))
    assert.match(terms, /More than one person may register from the same phone or computer/)
    assert.match(terms, /sign in and cast\s+your ballot from any device/)
})
