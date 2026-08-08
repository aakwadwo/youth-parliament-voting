import { PageShell, PageHeading } from '@/components/layout/PageShell'
import { Prose } from '@/components/layout/Prose'

export const metadata = {
    title: 'Contact',
    description:
        'How to reach the National Youth Parliament Electoral Commission about registration, voting or results.',
}

export default function ContactPage() {
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
                        <a href="tel:+233542298375">+233 54 229 8375</a>, Monday to Friday, 8am to
                        5pm. Extended to 8am to 8pm daily while the poll is open.
                    </dd>
                    <dt>Email</dt>
                    <dd>
                        <a href="mailto:aakwadwo1@gmail.com">
                            aakwadwo1@gmail.com
                        </a>
                    </dd>
                </dl>

                <h2>Data protection</h2>
                <p>
                    To request a copy of your registration data, or ask for it to be corrected or
                    erased, write to{' '}
                    <a href="mailto:aakwadwo1@gmail.com">
                        aakwadwo1@gmail.com
                    </a>
                    . See the <a href="/privacy">privacy notice</a> for what we hold and for how
                    long.
                </p>

                <h2>Accessibility</h2>
                <p>
                    To report something you cannot use, or to arrange another way to vote, write
                    to{' '}
                    <a href="mailto:aakwadwo1@gmail.com">
                        aakwadwo1@gmail.com
                    </a>
                    . See the <a href="/accessibility">accessibility statement</a>.
                </p>

                <h2>Reporting a security issue</h2>
                <p>
                    If you believe you have found a vulnerability, report it privately to{' '}
                    <a href="mailto:aakwadwo1@gmail.com">
                        aakwadwo1@gmail.com
                    </a>{' '}
                    rather than disclosing it publicly. We acknowledge reports within two working
                    days.
                </p>


            </Prose>
        </PageShell>
    )
}
