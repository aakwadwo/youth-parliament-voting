import { PageShell, PageHeading } from '@/components/layout/PageShell'
import { Prose } from '@/components/layout/Prose'

export const metadata = {
    title: 'Contact',
    description:
        'How to reach the National Youth Parliament electoral secretariat about registration, voting or results.',
}

export default function ContactPage() {
    return (
        <PageShell width="lg">
            <PageHeading
                title="Contact"
                description="How to reach the electoral secretariat."
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
                        <a href="tel:+233302123456">+233 30 212 3456</a>, Monday to Friday, 8am to
                        5pm. Extended to 8am to 8pm daily while the poll is open.
                    </dd>
                    <dt>Email</dt>
                    <dd>
                        <a href="mailto:elections@youthparliament.gov.gh">
                            elections@youthparliament.gov.gh
                        </a>
                    </dd>
                </dl>

                <h2>Data protection</h2>
                <p>
                    To request a copy of your registration data, or ask for it to be corrected or
                    erased, write to{' '}
                    <a href="mailto:privacy@youthparliament.gov.gh">
                        privacy@youthparliament.gov.gh
                    </a>
                    . See the <a href="/privacy">privacy notice</a> for what we hold and for how
                    long.
                </p>

                <h2>Accessibility</h2>
                <p>
                    To report something you cannot use, or to arrange another way to vote, write
                    to{' '}
                    <a href="mailto:accessibility@youthparliament.gov.gh">
                        accessibility@youthparliament.gov.gh
                    </a>
                    . See the <a href="/accessibility">accessibility statement</a>.
                </p>

                <h2>Reporting a security issue</h2>
                <p>
                    If you believe you have found a vulnerability, report it privately to{' '}
                    <a href="mailto:security@youthparliament.gov.gh">
                        security@youthparliament.gov.gh
                    </a>{' '}
                    rather than disclosing it publicly. We acknowledge reports within two working
                    days.
                </p>

                <h2>By post</h2>
                <p>
                    Electoral Secretariat
                    <br />
                    National Youth Parliament of Ghana
                    <br />
                    P.O. Box 1234
                    <br />
                    Accra, Ghana
                </p>
            </Prose>
        </PageShell>
    )
}
