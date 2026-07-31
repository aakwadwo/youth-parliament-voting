import test from 'node:test'
import assert from 'node:assert/strict'

import {
    request,
    postJson,
    messageForStatus,
    resolveErrorMessage,
    NETWORK_MESSAGE,
} from '@/lib/api-client'

/**
 * These tests exist for one reason: the bug where every unparseable response
 * was reported to voters as a connection failure. The assertions that matter
 * are the ones checking that a message about their connection appears if and
 * only if the request genuinely never reached a server.
 */

/** A minimal stand-in for the fetch Response the module actually consumes. */
function response(status, body, { headers = {} } = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: { get: (name) => headers[name] ?? headers[name.toLowerCase()] ?? null },
        text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    }
}

function withFetch(impl, run) {
    const original = globalThis.fetch
    globalThis.fetch = impl
    return run().finally(() => {
        globalThis.fetch = original
    })
}

test('a successful JSON response comes back parsed and ok', async () => {
    await withFetch(
        async () => response(200, { voter: { id: 'abc' } }),
        async () => {
            const result = await request('/api/thing')
            assert.equal(result.ok, true)
            assert.equal(result.status, 200)
            assert.deepEqual(result.data, { voter: { id: 'abc' } })
            assert.equal(result.error, null)
            assert.equal(result.networkError, false)
        }
    )
})

test('a server error is NOT reported as a network failure', async () => {
    // The whole point. A 500 reached a server; telling the voter to check
    // their connection sends them to fix something that is not broken.
    await withFetch(
        async () => response(500, { error: 'Could not complete your registration.' }),
        async () => {
            const result = await request('/api/register')
            assert.equal(result.ok, false)
            assert.equal(result.networkError, false)
            assert.equal(result.status, 500)
            assert.equal(result.error, 'Could not complete your registration.')
            assert.notEqual(result.error, NETWORK_MESSAGE)
        }
    )
})

test('an HTML error page is classified by status, not as a connection problem', async () => {
    // Next's own 500 page, or a gateway's 502, arrives as HTML. The old code
    // threw inside JSON.parse and fell into the network catch.
    await withFetch(
        async () => response(502, '<!doctype html><html><body>Bad Gateway</body></html>'),
        async () => {
            const result = await request('/api/vote')
            assert.equal(result.ok, false)
            assert.equal(result.networkError, false)
            assert.equal(result.status, 502)
            assert.equal(result.error, messageForStatus(502))
            assert.notEqual(result.error, NETWORK_MESSAGE)
            assert.doesNotMatch(result.error, /connection/i)
        }
    )
})

test('a 200 with an unparseable body is a server fault, not a network one', async () => {
    await withFetch(
        async () => response(200, 'not json at all'),
        async () => {
            const result = await request('/api/candidates')
            assert.equal(result.ok, false)
            assert.equal(result.networkError, false)
            assert.equal(result.code, 'MALFORMED_RESPONSE')
            assert.notEqual(result.error, NETWORK_MESSAGE)
        }
    )
})

test('only a rejected fetch produces the connection message', async () => {
    await withFetch(
        async () => {
            throw new TypeError('Failed to fetch')
        },
        async () => {
            const result = await request('/api/login')
            assert.equal(result.ok, false)
            assert.equal(result.networkError, true)
            assert.equal(result.status, 0)
            assert.equal(result.error, NETWORK_MESSAGE)
            assert.equal(result.code, 'NETWORK_ERROR')
        }
    )
})

test('an aborted request is not an error to show anyone', async () => {
    await withFetch(
        async () => {
            const error = new Error('aborted')
            error.name = 'AbortError'
            throw error
        },
        async () => {
            const result = await request('/api/election')
            assert.equal(result.aborted, true)
            assert.equal(result.networkError, false)
            assert.equal(result.error, null)
        }
    )
})

test('the stable error code is passed through for the caller to branch on', async () => {
    await withFetch(
        async () => response(403, { error: 'The election has not started yet.', code: 'ELECTION_NOT_STARTED' }),
        async () => {
            const result = await request('/api/vote')
            assert.equal(result.code, 'ELECTION_NOT_STARTED')
            assert.equal(result.error, 'The election has not started yet.')
            assert.equal(result.status, 403)
        }
    )
})

test('Retry-After is surfaced for throttled and unavailable responses', async () => {
    await withFetch(
        async () => response(429, { error: 'Too many attempts.' }, { headers: { 'Retry-After': '90' } }),
        async () => {
            const result = await request('/api/login')
            assert.equal(result.retryAfter, 90)
        }
    )
})

test('postJson sends JSON and its content type', async () => {
    let seen
    await withFetch(
        async (url, options) => {
            seen = { url, options }
            return response(200, { ok: true })
        },
        async () => {
            await postJson('/api/vote', { candidate_id: 'abc' })
        }
    )
    assert.equal(seen.url, '/api/vote')
    assert.equal(seen.options.method, 'POST')
    assert.equal(seen.options.headers['Content-Type'], 'application/json')
    assert.deepEqual(JSON.parse(seen.options.body), { candidate_id: 'abc' })
})

test('a server message is preferred, but only when it is usable prose', () => {
    assert.equal(resolveErrorMessage(409, { error: 'You have already voted.' }), 'You have already voted.')

    // Anything that is not a plain, short, single-line string falls back to
    // the status message, so a leaked stack trace or a proxy's object body
    // cannot reach a voter's screen.
    for (const body of [
        { error: { code: 500 } },
        { error: ['nope'] },
        { error: '' },
        { error: '   ' },
        { error: 'Error: connect ECONNREFUSED\n    at TCPConnectWrap.afterConnect' },
        { error: 'x'.repeat(400) },
        {},
        null,
        undefined,
    ]) {
        assert.equal(resolveErrorMessage(500, body), messageForStatus(500))
    }
})

test('every status a voter route can return has a usable sentence', () => {
    for (const status of [400, 401, 403, 404, 409, 413, 422, 429, 500, 502, 503, 504]) {
        const message = messageForStatus(status)
        assert.match(message, /\S/)
        // No status message may blame the voter's connection: by the time one
        // is used, a response was definitely received.
        assert.doesNotMatch(message, /check your connection/i)
    }
})

test('an unforeseen 5xx still reads as our fault rather than a generic shrug', () => {
    assert.equal(messageForStatus(507), messageForStatus(503))
    assert.equal(messageForStatus(599), messageForStatus(503))
})
