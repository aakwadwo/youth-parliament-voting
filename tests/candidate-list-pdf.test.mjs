import test from 'node:test'
import assert from 'node:assert/strict'

import { buildCandidateRegister } from '@/lib/candidate-register'
import { renderCandidateListPdf } from '@/lib/export/candidate-list-pdf'
import { makeFakeSupabase } from './fixtures/fake-supabase.mjs'
import { pdfText } from './fixtures/pdf-text.mjs'

/**
 * What the candidate list actually prints.
 *
 * The register is circulated to officials and candidates, so what it discloses
 * is worth asserting against the rendered bytes rather than the source. These
 * tests exist chiefly to hold one line: the constituency's internal code used
 * to be printed beside the seat's name, and a bare number on a public document
 * is something a reader has to decode rather than read.
 */

/**
 * A register with codes chosen so they cannot be mistaken for anything else the
 * document legitimately prints — not a candidate count, not a page number, not
 * a year.
 */
function registerWithCodes() {
    return {
        meta: {
            electionName: 'Test Election 2026',
            generatedAt: '2026-08-12T09:30:00.000Z',
            generatedBy: 'clerk@example.test',
        },
        summary: { regions: 1, constituencies: 2, candidates: 3, withPhoto: 0 },
        regions: [
            {
                region: 'Greater Accra',
                constituencies: [
                    {
                        id: 'c1',
                        name: 'Ablekuma Central',
                        region: 'Greater Accra',
                        code: 918273,
                        candidates: [
                            { id: 'd1', name: 'Ama Serwaa', isActive: true, photo: null },
                            { id: 'd2', name: 'Kwame Mensah', isActive: false, photo: null },
                        ],
                    },
                    {
                        id: 'c2',
                        name: 'Bantama',
                        region: 'Greater Accra',
                        code: 645102,
                        candidates: [
                            { id: 'd3', name: 'Yaw Boateng', isActive: true, photo: null },
                        ],
                    },
                ],
            },
        ],
    }
}

test('the candidate list prints no constituency code', async () => {
    const register = registerWithCodes()
    const text = pdfText(await renderCandidateListPdf(register))

    for (const constituency of register.regions[0].constituencies) {
        assert.ok(
            text.includes(constituency.name),
            `${constituency.name} should still be named`
        )
        assert.ok(
            !text.includes(String(constituency.code)),
            `code ${constituency.code} is printed in the candidate list`
        )
    }
})

test('the candidate list prints no internal identifier of any kind', async () => {
    const register = registerWithCodes()
    const text = pdfText(await renderCandidateListPdf(register))

    for (const constituency of register.regions[0].constituencies) {
        assert.ok(!text.includes(constituency.id), 'a constituency id reached the document')
        for (const candidate of constituency.candidates) {
            assert.ok(!text.includes(candidate.id), 'a candidate id reached the document')
        }
    }
})

test('everything genuinely useful to a reader survives', async () => {
    const register = registerWithCodes()
    const text = pdfText(await renderCandidateListPdf(register))

    assert.ok(text.includes('Test Election 2026'), 'election name')
    assert.ok(text.includes('Candidate list'), 'report title')
    assert.ok(text.includes('REGION: GREATER ACCRA'), 'region band')
    assert.ok(text.includes('CONSTITUENCY: Ablekuma Central'), 'constituency heading')
    assert.ok(text.includes('Ama Serwaa') && text.includes('Yaw Boateng'), 'candidate names')
    assert.ok(text.includes('Standing') && text.includes('Withdrawn'), 'standing status')
    assert.ok(/Generated/.test(text), 'generation time')
    assert.ok(text.includes('Electoral Commission'), 'issuing Commission')
    assert.ok(/Page \d+ of \d+/.test(text), 'pagination')
})

test('a constituency heading reads the same whether or not a code exists', async () => {
    // The previous implementation branched on the code being present, so the
    // heading changed shape depending on the data. It no longer can.
    const withCode = registerWithCodes()
    const withoutCode = registerWithCodes()
    for (const c of withoutCode.regions[0].constituencies) c.code = null

    const a = pdfText(await renderCandidateListPdf(withCode))
    const b = pdfText(await renderCandidateListPdf(withoutCode))

    for (const text of [a, b]) {
        assert.ok(text.includes('CONSTITUENCY: Ablekuma Central'))
        assert.ok(!/CONSTITUENCY: Ablekuma Central\s*\(/.test(text))
    }
})

test('the code is still carried on the register the application builds', async () => {
    // Hidden from the document, not dropped from the data: the builder still
    // reads it, and the admin portal and CSV import still rely on it.
    const register = await buildCandidateRegister(makeFakeSupabase(), {
        generatedBy: 'clerk@example.test',
    })

    const constituencies = register.regions.flatMap((r) => r.constituencies)
    const withCodes = constituencies.filter((c) => c.code != null)

    assert.ok(withCodes.length > 0, 'the register should still carry constituency codes')
    for (const c of constituencies) {
        assert.ok('code' in c, `${c.name} lost its code field`)
        assert.ok(c.id, `${c.name} lost its id`)
    }
})

test('candidate-to-constituency relationships are unchanged', async () => {
    const register = await buildCandidateRegister(makeFakeSupabase(), {
        generatedBy: 'clerk@example.test',
    })

    // Every candidate still sits under exactly one constituency, and the totals
    // the masthead prints still match what the body lists.
    const constituencies = register.regions.flatMap((r) => r.constituencies)
    const candidates = constituencies.flatMap((c) => c.candidates)

    assert.equal(candidates.length, register.summary.candidates)
    assert.equal(new Set(candidates.map((c) => c.id)).size, candidates.length, 'no duplication')
})
