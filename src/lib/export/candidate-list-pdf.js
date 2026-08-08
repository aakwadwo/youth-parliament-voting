import PDFDocument from 'pdfkit'

import { formatDateTime } from '@/lib/election-report'
import { ORGANISATION_NAME, ELECTORAL_COMMISSION } from '@/lib/election'
import {
    BRAND,
    PAGE,
    LOGO_PATH,
    contentWidth,
    tricolour,
    ensureSpace,
    paginate,
    renderDocument,
} from '@/lib/export/pdf-common'

/**
 * The candidate register, as a printable PDF.
 *
 * Built for one job: an officer sitting with a printout, going down the list
 * region by region and constituency by constituency, checking that everyone on
 * it should be on it. Everything in the layout serves that — the photograph
 * beside the name so a face can be matched, the constituency heading repeated
 * at the top of a continued page so a row is never orphaned from its seat, and
 * a numbered line per candidate so a correction can be pointed at precisely.
 *
 * It shows the register, not the result. No tally appears anywhere in this
 * document, which is what makes it safe to circulate before a poll opens.
 */

const ROW_HEIGHT = 34
const AVATAR = 24 // diameter
const DOC_LABEL = 'Candidate list'

/** Initials for a candidate with no usable photograph. */
function initials(name) {
    const parts = String(name ?? '')
        .split(/\s+/)
        .filter(Boolean)
    if (parts.length === 0) return '?'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * A circular portrait, or a lettered placeholder when there is no photograph.
 *
 * pdfkit decodes JPEG and PNG only, while the upload endpoint also accepts
 * WebP, so `doc.image` genuinely can throw on a photo that is present and
 * valid. It is caught here and falls through to the placeholder: a register
 * that fails to generate because one candidate's photograph is in the wrong
 * format would be a far worse outcome than a register with one grey circle.
 *
 * Returns whether a photograph was actually drawn, so the row can label itself
 * honestly. The alternative — labelling from `photo_url` being set — would
 * print a portrait-less row with no explanation whenever an image failed to
 * download or decode, and an officer checking photo coverage against the
 * register would be checking the wrong thing.
 *
 * @returns {boolean} true when a real photograph was rendered
 */
function drawAvatar(doc, { x, y, photo, name }) {
    const r = AVATAR / 2
    const cx = x + r
    const cy = y + r

    if (photo) {
        try {
            doc.save()
            doc.circle(cx, cy, r).clip()
            doc.image(photo, x, y, {
                cover: [AVATAR, AVATAR],
                align: 'center',
                valign: 'center',
            })
            doc.restore()
            doc.circle(cx, cy, r).lineWidth(0.6).strokeColor(BRAND.hairline).stroke()
            return true
        } catch {
            // pdfkit leaves the graphics stack unbalanced when image decoding
            // throws inside the clip, so the save is unwound explicitly before
            // anything else is drawn.
            try {
                doc.restore()
            } catch {
                /* nothing was saved */
            }
        }
    }

    doc.circle(cx, cy, r).fill(BRAND.greenLight)
    doc.circle(cx, cy, r).lineWidth(0.6).strokeColor(BRAND.hairline).stroke()
    doc.font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(BRAND.greenDark)
        .text(initials(name), x, cy - 4, { width: AVATAR, align: 'center', lineBreak: false })

    return false
}

function drawMasthead(doc, register) {
    const width = contentWidth(doc)

    tricolour(doc, PAGE.margin, PAGE.margin, width, 5)

    let y = PAGE.margin + 26

    try {
        doc.image(LOGO_PATH, PAGE.margin, y, { width: 54 })
    } catch {
        // The register must still generate if the brand asset is missing.
    }

    doc.font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(BRAND.green)
        .text(ORGANISATION_NAME.toUpperCase(), PAGE.margin + 68, y + 4, {
            width: width - 68,
            characterSpacing: 1.4,
        })

    doc.font('Helvetica-Bold')
        .fontSize(18)
        .fillColor(BRAND.ink)
        .text(register.meta.electionName, PAGE.margin + 68, doc.y + 4, { width: width - 68 })

    doc.font('Helvetica')
        .fontSize(11)
        .fillColor(BRAND.muted)
        .text('Candidate list', PAGE.margin + 68, doc.y + 2, { width: width - 68 })

    y = Math.max(doc.y, PAGE.margin + 26 + 54) + 20

    const { summary } = register
    const panelHeight = 62
    doc.roundedRect(PAGE.margin, y, width, panelHeight, 6).fillAndStroke(
        BRAND.greenLight,
        BRAND.green
    )

    const cells = [
        ['Regions', summary.regions],
        ['Constituencies', summary.constituencies],
        ['Candidates', summary.candidates],
        ['With photograph', summary.withPhoto],
    ]
    const cellWidth = width / cells.length

    cells.forEach(([label, value], i) => {
        const cx = PAGE.margin + cellWidth * i
        doc.font('Helvetica-Bold')
            .fontSize(16)
            .fillColor(BRAND.greenDark)
            .text(value.toLocaleString('en-GB'), cx, y + 14, { width: cellWidth, align: 'center' })
        doc.font('Helvetica')
            .fontSize(8.5)
            .fillColor(BRAND.muted)
            .text(label, cx, y + 38, { width: cellWidth, align: 'center' })
    })

    y += panelHeight + 16

    doc.y = y
    const rows = [
        ['Generated', formatDateTime(register.meta.generatedAt)],
        ['Generated by', register.meta.generatedBy ?? 'Not recorded'],
        ['Issued by', ELECTORAL_COMMISSION],
    ]
    rows.forEach(([label, value]) => {
        const rowY = doc.y
        doc.font('Helvetica')
            .fontSize(9)
            .fillColor(BRAND.muted)
            .text(label, PAGE.margin, rowY, { width: 110 })
        doc.font('Helvetica-Bold')
            .fontSize(9)
            .fillColor(BRAND.ink)
            .text(value, PAGE.margin + 110, rowY, { width: width - 110 })
        doc.moveDown(0.4)
    })

    doc.moveDown(0.6)
    doc.font('Helvetica')
        .fontSize(8)
        .fillColor(BRAND.muted)
        .text(
            'Every candidate held in the system is listed, grouped by region and constituency, ' +
                'including candidates marked withdrawn and constituencies with nobody standing. ' +
                'This document contains no vote totals.',
            PAGE.margin,
            doc.y,
            { width }
        )

    doc.moveDown(1.2)
}

function drawRegionBand(doc, region) {
    const width = contentWidth(doc)
    const candidates = region.constituencies.reduce((n, c) => n + c.candidates.length, 0)

    // A region heading with nothing under it on the page is a heading in the
    // wrong place, so it moves to the next page along with its first row.
    ensureSpace(doc, 26 + 22 + ROW_HEIGHT)

    const y = doc.y
    doc.rect(PAGE.margin, y, width, 26).fill(BRAND.green)
    doc.font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#FFFFFF')
        .text(`REGION: ${region.region.toUpperCase()}`, PAGE.margin + 10, y + 7.5, {
            width: width - 200,
            ellipsis: true,
            lineBreak: false,
        })
    doc.font('Helvetica')
        .fontSize(8.5)
        .fillColor('#FFFFFF')
        .text(
            `${region.constituencies.length} ${region.constituencies.length === 1 ? 'constituency' : 'constituencies'}  ·  ${candidates} ${candidates === 1 ? 'candidate' : 'candidates'}`,
            PAGE.margin + width - 190,
            y + 9,
            { width: 180, align: 'right', lineBreak: false }
        )

    doc.y = y + 26 + 8
}

function drawConstituencyHeading(doc, constituency, { continued = false } = {}) {
    const width = contentWidth(doc)
    const y = doc.y

    doc.rect(PAGE.margin, y, width, 22).fill(BRAND.zebra)
    doc.rect(PAGE.margin, y, 3, 22).fill(BRAND.gold)

    const label = constituency.code
        ? `CONSTITUENCY: ${constituency.name}  (${constituency.code})`
        : `CONSTITUENCY: ${constituency.name}`

    doc.font('Helvetica-Bold')
        .fontSize(9.5)
        .fillColor(BRAND.ink)
        .text(continued ? `${label}  — continued` : label, PAGE.margin + 12, y + 6.5, {
            width: width - 150,
            ellipsis: true,
            lineBreak: false,
        })

    if (!continued) {
        const n = constituency.candidates.length
        doc.font('Helvetica')
            .fontSize(8)
            .fillColor(BRAND.muted)
            .text(`${n} ${n === 1 ? 'candidate' : 'candidates'}`, PAGE.margin + width - 140, y + 7, {
                width: 130,
                align: 'right',
                lineBreak: false,
            })
    }

    doc.y = y + 22
}

function drawCandidateRow(doc, candidate, index) {
    const width = contentWidth(doc)
    const y = doc.y

    if (index % 2 === 1) {
        doc.rect(PAGE.margin, y, width, ROW_HEIGHT).fill('#FCFDFC')
    }

    doc.font('Helvetica')
        .fontSize(8)
        .fillColor(BRAND.muted)
        .text(String(index + 1), PAGE.margin + 6, y + ROW_HEIGHT / 2 - 4, {
            width: 18,
            align: 'right',
            lineBreak: false,
        })

    const hasPhoto = drawAvatar(doc, {
        x: PAGE.margin + 32,
        y: y + (ROW_HEIGHT - AVATAR) / 2,
        photo: candidate.photo,
        name: candidate.name,
    })

    const nameX = PAGE.margin + 32 + AVATAR + 12
    doc.font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(BRAND.ink)
        .text(candidate.name, nameX, y + ROW_HEIGHT / 2 - 6, {
            width: width - (nameX - PAGE.margin) - 110,
            ellipsis: true,
            lineBreak: false,
        })

    // Status is stated in words, never by colour alone — the register is
    // routinely printed in black and white.
    const status = candidate.isActive ? 'Standing' : 'Withdrawn'
    doc.font(candidate.isActive ? 'Helvetica' : 'Helvetica-Bold')
        .fontSize(8)
        .fillColor(candidate.isActive ? BRAND.muted : BRAND.red)
        .text(status, PAGE.margin + width - 104, y + ROW_HEIGHT / 2 - 4, {
            width: 60,
            align: 'right',
            lineBreak: false,
        })

    if (!hasPhoto) {
        doc.font('Helvetica')
            .fontSize(7)
            .fillColor(BRAND.muted)
            .text('no photo', PAGE.margin + width - 40, y + ROW_HEIGHT / 2 - 3.5, {
                width: 34,
                align: 'right',
                lineBreak: false,
            })
    }

    doc.moveTo(PAGE.margin, y + ROW_HEIGHT)
        .lineTo(PAGE.margin + width, y + ROW_HEIGHT)
        .lineWidth(0.4)
        .strokeColor(BRAND.hairline)
        .stroke()

    doc.y = y + ROW_HEIGHT
}

/**
 * The constituencies in a region where nobody is standing, as one block.
 *
 * They were originally given the same full heading as every other
 * constituency. In a real register that buried the review: two thirds of the
 * seats had no candidate, so the document became page after page of "No
 * candidates registered", and the candidates the officer had actually opened
 * the file to check were scattered between them. The information still has to
 * be in the document — an unfilled seat is exactly what this review is for —
 * but it belongs in one line per region, not one page.
 */
function drawEmptyConstituencies(doc, constituencies) {
    if (constituencies.length === 0) return

    const width = contentWidth(doc)
    const names = constituencies.map((c) => c.name).join(', ')

    // Measured before the space check, so a long list is never split with its
    // heading stranded at the foot of a page.
    doc.font('Helvetica').fontSize(8.5)
    const height = doc.heightOfString(names, { width: width - 24 }) + 32
    ensureSpace(doc, height)

    const y = doc.y
    doc.roundedRect(PAGE.margin, y, width, height - 8, 4).fillAndStroke('#FDF6F6', '#F2D9D9')

    doc.font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor(BRAND.red)
        .text(
            `No candidates registered in ${constituencies.length} ${constituencies.length === 1 ? 'constituency' : 'constituencies'}:`,
            PAGE.margin + 12,
            y + 8,
            { width: width - 24 }
        )

    doc.font('Helvetica').fontSize(8.5).fillColor(BRAND.ink).text(names, PAGE.margin + 12, doc.y + 2, {
        width: width - 24,
    })

    doc.y = y + height
    doc.moveDown(0.3)
}

function drawConstituency(doc, constituency) {
    // Heading plus at least one row, so a constituency never opens at the very
    // bottom of a page with its first candidate overleaf.
    ensureSpace(doc, 22 + ROW_HEIGHT + 6)
    drawConstituencyHeading(doc, constituency)

    constituency.candidates.forEach((candidate, index) => {
        if (doc.y + ROW_HEIGHT > doc.page.height - PAGE.margin - 30) {
            doc.addPage()
            drawConstituencyHeading(doc, constituency, { continued: true })
        }
        drawCandidateRow(doc, candidate, index)
    })

    doc.moveDown(0.8)
}

/**
 * @param register a register from `buildCandidateRegister`, with each candidate
 *                 optionally carrying a `photo` Buffer
 * @returns {Promise<Buffer>} the rendered PDF
 */
export function renderCandidateListPdf(register) {
    const doc = new PDFDocument({
        size: 'A4',
        margin: PAGE.margin,
        // Required so paginate() can revisit pages to stamp page numbers.
        bufferPages: true,
        info: {
            Title: `${register.meta.electionName} — ${DOC_LABEL}`,
            Author: ORGANISATION_NAME,
            Subject: 'Candidate register by region and constituency',
            Creator: `${ORGANISATION_NAME} Voting Platform`,
            CreationDate: new Date(register.meta.generatedAt),
        },
    })

    return renderDocument(doc, () => {
        drawMasthead(doc, register)

        if (register.regions.length === 0) {
            doc.font('Helvetica-Oblique')
                .fontSize(10)
                .fillColor(BRAND.muted)
                .text('No constituencies or candidates have been set up yet.', PAGE.margin, doc.y, {
                    width: contentWidth(doc),
                })
        }

        for (const region of register.regions) {
            drawRegionBand(doc, region)

            // Contested seats first, in full; the unfilled ones summarised
            // underneath. Both keep their alphabetical order.
            const contested = region.constituencies.filter((c) => c.candidates.length > 0)
            const empty = region.constituencies.filter((c) => c.candidates.length === 0)

            for (const constituency of contested) {
                drawConstituency(doc, constituency)
            }
            drawEmptyConstituencies(doc, empty)

            doc.moveDown(0.4)
        }

        paginate(doc, `${register.meta.electionName} — ${DOC_LABEL}`)
    })
}
