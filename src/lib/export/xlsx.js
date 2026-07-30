import { createZip } from '@/lib/export/zip'

/**
 * A small SpreadsheetML writer: enough of the format to emit a branded,
 * multi-sheet, correctly typed workbook, and nothing more.
 *
 * Values are written as real types — numbers as numbers, dates as dates — so
 * the totals column can be summed and the timestamps sorted in Excel, Numbers
 * or LibreOffice. Text is written as an inline string, which skips the shared
 * string table entirely at a negligible size cost for a report this size.
 */

const XML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }

function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => XML_ESCAPES[c])
}

// XML 1.0 permits only tab, newline, carriage return and #x20 upward. Any other
// control character — which a pasted candidate name can easily carry — makes
// Excel declare the entire workbook corrupt, so they are removed, not escaped.
const XML_ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

function cellText(value) {
    return esc(String(value ?? '').replace(XML_ILLEGAL, ''))
}

/** A1-style reference for a zero-based row/column pair. */
function ref(rowIndex, colIndex) {
    let col = ''
    let n = colIndex
    do {
        col = String.fromCharCode(65 + (n % 26)) + col
        n = Math.floor(n / 26) - 1
    } while (n >= 0)
    return `${col}${rowIndex + 1}`
}

// Style indices, matching the <cellXfs> order in the stylesheet below.
export const STYLE = {
    DEFAULT: 0,
    TITLE: 1,
    HEADER: 2,
    LABEL: 3,
    NUMBER: 4,
    PERCENT: 5,
    DATETIME: 6,
    MUTED: 7,
}

/**
 * The workbook stylesheet.
 *
 * The header fill is Parliament Green (#187B28) from the logo with white text,
 * so an exported report is recognisably the same document as the on-screen one.
 */
function stylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2">
<numFmt numFmtId="164" formatCode="#,##0"/>
<numFmt numFmtId="165" formatCode="0.0&quot;%&quot;"/>
</numFmts>
<fonts count="5">
<font><sz val="11"/><name val="Calibri"/><color rgb="FF1A1A1A"/></font>
<font><sz val="16"/><b/><name val="Calibri"/><color rgb="FF187B28"/></font>
<font><sz val="11"/><b/><name val="Calibri"/><color rgb="FFFFFFFF"/></font>
<font><sz val="11"/><b/><name val="Calibri"/><color rgb="FF1A1A1A"/></font>
<font><sz val="10"/><name val="Calibri"/><color rgb="FF55555F"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF187B28"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FFE3E5E3"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="8">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="22" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
<dxfs count="0"/>
</styleSheet>`
}

/** Excel serial date: days since 1899-12-30, fractional part is the time. */
function toExcelSerial(date) {
    const ms = date.getTime() - Date.UTC(1899, 11, 30)
    return ms / 86400000
}

function cellXml(cell, rowIndex, colIndex) {
    const r = ref(rowIndex, colIndex)
    if (cell === null || cell === undefined || cell === '') {
        return `<c r="${r}" s="${STYLE.DEFAULT}"/>`
    }

    const { value, style = STYLE.DEFAULT } = typeof cell === 'object' ? cell : { value: cell }

    if (value instanceof Date) {
        return `<c r="${r}" s="${style}"><v>${toExcelSerial(value)}</v></c>`
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return `<c r="${r}" s="${style}"><v>${value}</v></c>`
    }
    if (typeof value === 'boolean') {
        return `<c r="${r}" s="${style}" t="b"><v>${value ? 1 : 0}</v></c>`
    }
    return `<c r="${r}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${cellText(value)}</t></is></c>`
}

function sheetXml({ rows, columnWidths = [], freezeRows = 0, autoFilter = null }) {
    const cols = columnWidths.length
        ? `<cols>${columnWidths
              .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
              .join('')}</cols>`
        : ''

    // Keeping the header row on screen matters: a 275-constituency sheet is
    // unreadable once the column titles have scrolled away.
    const pane = freezeRows
        ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${freezeRows}" topLeftCell="A${freezeRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
        : ''

    const body = rows
        .map(
            (row, rowIndex) =>
                `<row r="${rowIndex + 1}">${row.map((cell, colIndex) => cellXml(cell, rowIndex, colIndex)).join('')}</row>`
        )
        .join('')

    const filter = autoFilter ? `<autoFilter ref="${autoFilter}"/>` : ''

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${pane}${cols}<sheetData>${body}</sheetData>${filter}</worksheet>`
}

/**
 * @param {Array<{ name: string, rows: Array<Array<any>>, columnWidths?: number[],
 *                 freezeRows?: number, autoFilter?: string }>} sheets
 * @returns {Buffer} a complete .xlsx file
 */
export function createWorkbook(sheets) {
    const overrides = sheets
        .map(
            (_, i) =>
                `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
        )
        .join('')

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${overrides}
</Types>`

    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`

    const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheets
        .map(
            (s, i) =>
                // Sheet names are capped at 31 chars and cannot contain : \ / ? * [ ]
                `<sheet name="${cellText(s.name.replace(/[:\\/?*[\]]/g, '').slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
        )
        .join('')}</sheets>
</workbook>`

    const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets
    .map(
        (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
    )
    .join('')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`

    return createZip([
        { name: '[Content_Types].xml', data: contentTypes },
        { name: '_rels/.rels', data: rootRels },
        { name: 'xl/workbook.xml', data: workbook },
        { name: 'xl/_rels/workbook.xml.rels', data: workbookRels },
        { name: 'xl/styles.xml', data: stylesXml() },
        ...sheets.map((sheet, i) => ({
            name: `xl/worksheets/sheet${i + 1}.xml`,
            data: sheetXml(sheet),
        })),
    ])
}
