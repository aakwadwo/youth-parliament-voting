import { inflateSync } from 'node:zlib'

/**
 * The visible text of a rendered PDF.
 *
 * pdfkit Flate-compresses its content streams and writes glyphs as hex runs
 * inside TJ arrays, interleaved with kerning numbers, so the drawn words are
 * neither searchable in the raw bytes nor contiguous once inflated.
 *
 * Only the text-showing operators are read. Decoding whole streams instead
 * would sweep up drawing operators — `/DeviceRGB` alone is enough to make a
 * search for "Device" report a false positive — and an assertion about what a
 * document does or does not disclose is worthless if it can fail on a
 * colour-space operator.
 *
 * Shared by the registration-statistics and candidate-list PDF tests, both of
 * which have to prove a negative about the document's contents.
 */
export function pdfText(buffer) {
    let streams = ''
    let index = 0

    while ((index = buffer.indexOf('stream', index)) !== -1) {
        let start = index + 6
        if (buffer[start] === 0x0d) start += 1
        if (buffer[start] === 0x0a) start += 1

        const end = buffer.indexOf('endstream', start)
        if (end === -1) break

        try {
            streams += inflateSync(buffer.subarray(start, end)).toString('latin1')
        } catch {
            /* not a compressed content stream — fonts, images */
        }
        index = end + 9
    }

    const decodeItem = (item) =>
        item.startsWith('<')
            ? Buffer.from(item.slice(1, -1), 'hex').toString('latin1')
            : item.slice(1, -1).replace(/\\([()\\])/g, '$1')

    const runs = []

    // [ <hex> -10 (literal) ] TJ — kerning numbers dropped, glyph runs joined,
    // because one .text() call becomes one array and its words must stay whole.
    for (const [, body] of streams.matchAll(
        /\[((?:\s|<[0-9a-fA-F]*>|\((?:[^()\\]|\\.)*\)|-?[\d.]+)*)\]\s*TJ/g
    )) {
        const parts = body.match(/<[0-9a-fA-F]*>|\((?:[^()\\]|\\.)*\)/g) ?? []
        runs.push(parts.map(decodeItem).join(''))
    }

    // The single-string form.
    for (const [, item] of streams.matchAll(/(<[0-9a-fA-F]*>|\((?:[^()\\]|\\.)*\))\s*Tj/g)) {
        runs.push(decodeItem(item))
    }

    // Separated, so two unrelated runs cannot be read as one word.
    return runs.join('\n')
}
