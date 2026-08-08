import { PageShell, PageHeading } from '@/components/layout/PageShell'
import { Prose, LastUpdated } from '@/components/layout/Prose'

export const metadata = {
    title: 'Accessibility statement',
    description:
        'How accessible the National Youth Parliament voting platform is, and how to report a problem.',
}

/**
 * A public service that people are required to use in order to exercise a vote
 * should say plainly how accessible it is, including where it falls short.
 */
export default function AccessibilityPage() {
    return (
        <PageShell width="lg">
            <PageHeading
                title="Accessibility statement"
                description="How accessible this service is, and how to tell us when it is not."
            />
            <LastUpdated date="2026-07-30" />

            <Prose className="mt-8">
                <h2>Our commitment</h2>
                <p>
                    Every eligible person must be able to cast a ballot independently and in
                    secret. This service is built to meet WCAG 2.2 level AA.
                </p>

                <h2>What we have done</h2>
                <ul>
                    <li>
                        every text and background pairing is checked to meet at least 4.5:1
                        contrast, and most exceed 7:1
                    </li>
                    <li>
                        the whole service works with a keyboard alone. The ballot is a radio
                        group, so arrow keys move between candidates
                    </li>
                    <li>
                        every form field has a visible label that is programmatically associated
                        with its control, and errors are announced and linked to the field they
                        describe
                    </li>
                    <li>
                        the page can be zoomed to 200% and used at 320px wide without content
                        being lost or requiring horizontal scrolling
                    </li>
                    <li>
                        status is never conveyed by colour alone; every coloured indicator also
                        carries text
                    </li>
                    <li>animation is minimal, and is suppressed if you ask your device to reduce motion</li>
                </ul>

                <h2>Known limitations</h2>
                <ul>
                    <li>
                        Candidate photographs are supplied by candidates and do not carry
                        individual descriptions. They are marked as decorative, and every
                        candidate&apos;s name is always shown as text, so no information is lost
                        if images do not load or are not announced.
                    </li>
                    <li>
                        The constituency picker is a searchable list of 275 entries. It is fully
                        keyboard operable, but on a screen reader it is slower to work through
                        than a short list would be.
                    </li>
                    <li>
                        This service has been tested with VoiceOver, NVDA and keyboard-only
                        navigation. It has not yet been tested with voice control software.
                    </li>
                </ul>

                <h2>If you cannot use this service</h2>
                <p>
                    You have a right to vote regardless of whether you can use this website. If
                    you cannot register or vote online for any reason, contact the Electoral
                    Commission and we will make alternative arrangements.
                </p>

                <h2>Reporting a problem</h2>
                <p>
                    If you find something you cannot use, tell us at{' '}
                    <a href="mailto:aakwadwo1@gmail.com">
                        aakwadwo1@gmail.com
                    </a>
                    . Include the page and what happened. We reply within five working days, and
                    treat anything that blocks a person from voting as urgent.
                </p>
            </Prose>
        </PageShell>
    )
}
