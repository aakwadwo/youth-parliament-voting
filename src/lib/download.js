/**
 * Downloads a generated file from an admin export endpoint.
 *
 * The exports are authenticated GETs behind an httpOnly cookie, so they cannot
 * simply be an `<a download href>` — the response has to be fetched, checked,
 * and only then handed to the browser as a blob. That is a dozen fiddly lines
 * (parse Content-Disposition, make an object URL, click a detached anchor,
 * revoke), and every export button needs exactly the same dozen.
 *
 * @param {string} url          the export endpoint
 * @param {string} fallbackName filename to use if the server does not name one
 * @returns {Promise<{ ok: true, filename: string } | { ok: false, error: string }>}
 */
export async function downloadExport(url, fallbackName) {
    let res
    try {
        res = await fetch(url)
    } catch {
        return { ok: false, error: 'Could not reach the server. Please try again.' }
    }

    if (!res.ok) {
        let error = 'Could not generate the file.'
        try {
            error = (await res.json()).error ?? error
        } catch {
            /* non-JSON error body */
        }
        return { ok: false, error }
    }

    // The server names the file after the election and export date. The browser
    // only receives that via Content-Disposition, so it is parsed back out
    // rather than guessed at.
    const disposition = res.headers.get('Content-Disposition') ?? ''
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName

    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)

    return { ok: true, filename }
}
