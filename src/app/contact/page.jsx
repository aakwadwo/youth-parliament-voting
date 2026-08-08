import { PageShell, PageHeading } from '@/components/layout/PageShell'
import { Prose } from '@/components/layout/Prose'
import { CONTACT_EMAIL, CONTACT_PHONE_DISPLAY, CONTACT_PHONE_TEL } from '@/lib/election'

export const metadata = {
    title: 'Contact',
    description:
        'How to reach the National Youth Parliament Electoral Commission about registration, voting or results.',
}

/**
 * Every address and number on this page comes from `@/lib/election`. They were
 * previously written out in each section, and a change of number is exactly the
 * kind of edit that updates four of five occurrences.
 */
export default function ContactPage() {
    const email = (
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
    )

    return (
        <PageShell width="lg">
            <PageHeading
                title="Contact"
                description="How to reach the Electoral Commission."
            />

            <Prose className="mt-8">
                <h2>Registration and voting</h2>
                <p>
                    If you cannot register, cannot sign in, or believe a ballot has been recorded
                    against your registration in error:
                </p>
                <dl>
                    <dt>Telephone</dt>
                    <dd>
                        <a href={`tel:${CONTACT_PHONE_TEL}`}>{CONTACT_PHONE_DISPLAY}</a>, Monday to
                        Friday, 8am to 5pm. Extended to 8am to 8pm daily while the poll is open.
                    </dd>
                    <dt>Email</dt>
                    <dd>{email}</dd>
                </dl>

                <h2>Results</h2>
                <p>
                    Results are published on the <a href="/results">election results page</a> once
                    voting has closed. You do not need to sign in to read them. No results,
                    totals or partial counts are published while voting is still open.
                </p>

                <h2>Data protection</h2>
                <p>
                    To request a copy of your registration data, or ask for it to be corrected or
                    erased, write to {email}. See the <a href="/privacy">privacy notice</a> for
                    what we hold and for how long.
                </p>

                <h2>Accessibility</h2>
                <p>
                    To report something you cannot use, or to arrange another way to vote, write
                    to {email}. See the <a href="/accessibility">accessibility statement</a>.
                </p>

                <h2>Reporting a security issue</h2>
                <p>
                    If you believe you have found a vulnerability, report it privately to {email}{' '}
                    rather than disclosing it publicly. We acknowledge reports within two working
                    days.
                </p>
            </Prose>
        </PageShell>
    )
}
