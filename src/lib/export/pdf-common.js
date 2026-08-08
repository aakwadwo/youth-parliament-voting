import path from 'node:path'

/**
 * The drawing primitives every PDF this platform produces is built from.
 *
 * Extracted when the candidate register became a second document: the palette,
 * the tricolour rule, the section heading and the footer are the platform's
 * institutional identity, not the election report's, and two documents that
 * claim to come from the same Commission must not drift into two different
 * house styles because each drew its own header.
 *
 * Colours are the logo's own, sampled from public/ypg.jpg.
 */

export const BRAND = {
    green: '#187B28',
    greenDark: '#0F5C1D',
    greenLight: '#E7F3EA',
    gold: '#F9C50F',
    red: '#DC0B10',
    ink: '#1A1A1A',
    muted: '#55555F',
    hairline: '#E3E5E3',
    zebra: '#F7F8F7',
}

export const PAGE = { margin: 48 }

export const LOGO_PATH = path.join(process.cwd(), 'public', 'brand', 'emblem.png')

export function contentWidth(doc) {
    return doc.page.width - PAGE.margin * 2
}

/** Draws the tricolour rule used throughout the interface. */
export function tricolour(doc, x, y, width, height = 3) {
    const third = width / 3
    doc.rect(x, y, third, height).fill(BRAND.red)
    doc.rect(x + third, y, third, height).fill(BRAND.gold)
    doc.rect(x + third * 2, y, third, height).fill(BRAND.green)
}

/** Starts a new page when the remaining space cannot hold `needed` points. */
export function ensureSpace(doc, needed) {
    if (doc.y + needed > doc.page.height - PAGE.margin - 30) {
        doc.addPage()
    }
}

export function sectionHeading(doc, text) {
    ensureSpace(doc, 60)
    doc.moveDown(0.8)
    const y = doc.y
    doc.font('Helvetica-Bold').fontSize(13).fillColor(BRAND.ink).text(text, PAGE.margin, y)
    doc.moveTo(PAGE.margin, doc.y + 4)
        .lineTo(doc.page.width - PAGE.margin, doc.y + 4)
        .lineWidth(0.5)
        .strokeColor(BRAND.hairline)
        .stroke()
    doc.moveDown(0.7)
}

export function drawTable(doc, columns, rows) {
    const rowHeight = 18
    const totalWidth = columns.reduce((sum, c) => sum + c.width, 0)

    const header = () => {
        const y = doc.y
        doc.rect(PAGE.margin, y, totalWidth, rowHeight).fill(BRAND.green)
        let x = PAGE.margin
        for (const col of columns) {
            doc.font('Helvetica-Bold')
                .fontSize(8)
                .fillColor('#FFFFFF')
                .text(col.header, x + 6, y + 5.5, {
                    width: col.width - 12,
                    align: col.align,
                    lineBreak: false,
                })
            x += col.width
        }
        doc.y = y + rowHeight
    }

    ensureSpace(doc, rowHeight * 3)
    header()

    rows.forEach((row, i) => {
        if (doc.y + rowHeight > doc.page.height - PAGE.margin - 30) {
            doc.addPage()
            header()
        }
        const y = doc.y
        if (i % 2 === 1) {
            doc.rect(PAGE.margin, y, totalWidth, rowHeight).fill(BRAND.zebra)
        }
        let x = PAGE.margin
        for (const col of columns) {
            const raw = col.get(row)
            const text = typeof raw === 'number' ? raw.toLocaleString('en-GB') : String(raw ?? '—')
            doc.font(col.bold ? 'Helvetica-Bold' : 'Helvetica')
                .fontSize(8.5)
                .fillColor(BRAND.ink)
                .text(text, x + 6, y + 5, {
                    width: col.width - 12,
                    align: col.align,
                    ellipsis: true,
                    lineBreak: false,
                })
            x += col.width
        }
        doc.y = y + rowHeight
    })

    doc.moveDown(0.5)
}

/**
 * Page numbers and a running footer, applied once the body is laid out.
 *
 * @param doc          a document opened with `bufferPages: true`
 * @param footerLabel  what this document is, printed bottom-left on every page
 */
export function paginate(doc, footerLabel) {
    const range = doc.bufferedPageRange()
    for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i)

        // The footer sits below the bottom margin, and pdfkit responds to text
        // written past that margin by starting a new page — which produced a
        // blank page per footer and left the real pages unfooted. Dropping the
        // margin for the duration of the write suppresses that pagination.
        const originalBottomMargin = doc.page.margins.bottom
        doc.page.margins.bottom = 0

        const y = doc.page.height - PAGE.margin + 8
        const width = contentWidth(doc)

        doc.moveTo(PAGE.margin, y - 8)
            .lineTo(doc.page.width - PAGE.margin, y - 8)
            .lineWidth(0.5)
            .strokeColor(BRAND.hairline)
            .stroke()

        doc.font('Helvetica')
            .fontSize(7.5)
            .fillColor(BRAND.muted)
            .text(footerLabel, PAGE.margin, y, {
                width: width / 2,
                lineBreak: false,
            })

        doc.font('Helvetica')
            .fontSize(7.5)
            .fillColor(BRAND.muted)
            .text(`Page ${i - range.start + 1} of ${range.count}`, PAGE.margin + width / 2, y, {
                width: width / 2,
                align: 'right',
                lineBreak: false,
            })

        doc.page.margins.bottom = originalBottomMargin
    }
}

/**
 * Buffers a pdfkit document into a Buffer.
 *
 * `draw` is called synchronously with the document; anything it throws rejects
 * the promise rather than leaving a half-written stream nobody is listening to.
 */
export function renderDocument(doc, draw) {
    return new Promise((resolve, reject) => {
        const chunks = []
        doc.on('data', (chunk) => chunks.push(chunk))
        doc.on('end', () => resolve(Buffer.concat(chunks)))
        doc.on('error', reject)

        try {
            draw(doc)
            doc.end()
        } catch (error) {
            reject(error)
        }
    })
}
