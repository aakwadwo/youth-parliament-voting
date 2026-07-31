/**
 * The browser's side of the API contract.
 *
 * WHY THIS EXISTS
 *
 * Every voter-facing page used to be written like this:
 *
 *     try {
 *         const res = await fetch(url, ...)
 *         const data = await res.json()
 *         if (!res.ok) setError(data.error ?? 'Something went wrong.')
 *     } catch {
 *         setError('We could not reach the server. Check your connection…')
 *     }
 *
 * which is wrong in a way that matters on an election platform. `res.json()`
 * sits inside the same `try` as the fetch, so *any* response that is not valid
 * JSON lands in the catch and is reported as a connection failure — a 502 from
 * the edge, a 500 rendered as Next's HTML error page, a truncated body, a
 * captive-portal login page returning 200 with HTML. In each of those cases the
 * request reached a server and the server answered; telling the voter to check
 * their connection sends them to restart their router when the fault is ours.
 * During a national poll that is the difference between a support line that
 * hears "the site is broken" and one that hears "my internet is broken".
 *
 * So: the fetch call is the only thing inside the network `try`. A rejection
 * there — and only there — is a real network failure. Everything after it is a
 * response, and a response is classified by status and body, never by whether
 * it happened to parse.
 */

/** Statuses map to a sentence only when the server did not supply a better one. */
const STATUS_MESSAGES = {
    400: 'Some of the details sent were not valid. Please check the form and try again.',
    401: 'Your session is no longer valid. Please sign in again.',
    403: 'This action is not permitted right now.',
    404: 'We could not find what you were looking for.',
    409: 'This has already been recorded.',
    413: 'That file is too large.',
    422: 'Some of the details sent were not valid. Please check the form and try again.',
    429: 'Too many attempts. Please wait a moment and try again.',
    500: 'Something went wrong on our side. Please try again in a moment.',
    502: 'The service is temporarily unavailable. Please try again in a moment.',
    503: 'The service is temporarily unavailable. Please try again in a moment.',
    504: 'The service took too long to respond. Please try again in a moment.',
}

const NETWORK_MESSAGE =
    'We could not reach the server. Check your connection and try again.'

const UNKNOWN_MESSAGE = 'Something went wrong. Please try again.'

/**
 * A sentence for a status the server gave us no message for.
 *
 * Grouped by class rather than enumerated exhaustively, so an unforeseen 5xx
 * still reads as "our fault, try again" instead of falling through to the
 * generic line.
 */
export function messageForStatus(status) {
    if (STATUS_MESSAGES[status]) return STATUS_MESSAGES[status]
    if (status >= 500) return STATUS_MESSAGES[503]
    if (status >= 400) return UNKNOWN_MESSAGE
    return UNKNOWN_MESSAGE
}

/**
 * Picks the message to show for a failed response.
 *
 * The server's own `error` wins when there is one, because it is written for
 * the specific situation ("This phone number is already registered…") and the
 * status alone cannot express that. It is used verbatim only when it is a
 * non-empty string: a body of `{ error: { code: 500 } }` from some intermediate
 * proxy must not reach a voter as "[object Object]".
 *
 * Anything that is not a plain, reasonable-length string is discarded in
 * favour of the status message, which also keeps a stack trace or a Postgres
 * detail leaked by an upstream component off the screen.
 */
export function resolveErrorMessage(status, body) {
    const supplied = body?.error
    if (typeof supplied === 'string') {
        const trimmed = supplied.trim()
        if (trimmed && trimmed.length <= 300 && !/\n/.test(trimmed)) return trimmed
    }
    return messageForStatus(status)
}

function retryAfterSeconds(response) {
    const header = response.headers?.get?.('Retry-After')
    if (!header) return null
    const seconds = Number(header)
    return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null
}

/**
 * Reads a body as JSON without ever throwing.
 *
 * Returns `undefined` for anything that is not JSON — an HTML error page, an
 * empty 204, a truncated response. Callers treat `undefined` as "no usable
 * body", which is a different thing from "the request failed".
 */
async function readJson(response) {
    try {
        const text = await response.text()
        if (!text) return undefined
        return JSON.parse(text)
    } catch {
        return undefined
    }
}

/**
 * Performs a request and classifies the outcome.
 *
 * Always resolves — never rejects — so callers have no reason to wrap it in a
 * `try` that would recreate the bug this module exists to fix.
 *
 * @returns {Promise<{
 *   ok: boolean, status: number, data: any, error: string|null,
 *   code: string|null, networkError: boolean, aborted: boolean,
 *   retryAfter: number|null
 * }>}
 *   `status` is 0 when no response was received at all.
 */
export async function request(url, options = {}) {
    let response
    try {
        response = await fetch(url, options)
    } catch (error) {
        // The only genuine "we could not reach the server" case: fetch itself
        // rejected, so no HTTP response exists. An aborted request lands here
        // too and is flagged separately — a component unmounting mid-request
        // is not an error to show anyone.
        const aborted = error?.name === 'AbortError'
        return {
            ok: false,
            status: 0,
            data: null,
            error: aborted ? null : NETWORK_MESSAGE,
            code: aborted ? 'ABORTED' : 'NETWORK_ERROR',
            networkError: !aborted,
            aborted,
            retryAfter: null,
        }
    }

    const body = await readJson(response)

    if (!response.ok) {
        return {
            ok: false,
            status: response.status,
            data: body ?? null,
            error: resolveErrorMessage(response.status, body),
            code: typeof body?.code === 'string' ? body.code : null,
            networkError: false,
            aborted: false,
            retryAfter: retryAfterSeconds(response),
        }
    }

    // A 2xx whose body did not parse is still a server fault, not a network
    // one. Reporting it as a connection problem is exactly the misdiagnosis
    // this module was written to stop.
    if (body === undefined && response.status !== 204) {
        return {
            ok: false,
            status: response.status,
            data: null,
            error: messageForStatus(500),
            code: 'MALFORMED_RESPONSE',
            networkError: false,
            aborted: false,
            retryAfter: null,
        }
    }

    return {
        ok: true,
        status: response.status,
        data: body ?? null,
        error: null,
        code: null,
        networkError: false,
        aborted: false,
        retryAfter: null,
    }
}

export function getJson(url, options = {}) {
    return request(url, { ...options, method: 'GET' })
}

export function postJson(url, body, options = {}) {
    return request(url, {
        ...options,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...options.headers },
        body: JSON.stringify(body),
    })
}

export { NETWORK_MESSAGE }
