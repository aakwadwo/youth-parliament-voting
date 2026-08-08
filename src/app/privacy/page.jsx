import { PageShell, PageHeading } from '@/components/layout/PageShell'
import { Prose, LastUpdated } from '@/components/layout/Prose'
import { MIN_AGE, MAX_AGE } from '@/lib/validation'

export const metadata = {
    title: 'Privacy notice',
    description:
        'What the National Youth Parliament voting platform records about voters, why, and how long it is kept.',
}

export default function PrivacyPage() {
    return (
        <PageShell width="lg">
            <PageHeading
                title="Privacy notice"
                description="What this service records about you, why it needs it, and how long it is kept."
            />
            <LastUpdated date="2026-07-30" />

            <Prose className="mt-8">
                <h2>What we collect</h2>
                <p>When you register to vote, this service stores:</p>
                <ul>
                    <li>your full name</li>
                    <li>your date of birth</li>
                    <li>your mobile number</li>
                    <li>the constituency you register in</li>
                    <li>the date and time you registered</li>
                    <li>whether you have cast a ballot</li>
                </ul>

                <h2>What we do not collect</h2>
                <p>
                    We do not record who you voted for. Your ballot is stored with no reference of
                    any kind back to you: not your name, not your number, not an identifier that
                    could be traced to your registration. This is enforced by the design of the
                    database, not by policy, so no member of staff and no administrator can
                    retrieve how any individual voted. Nor do we collect your address, your Ghana
                    Card number, your photograph, or any payment details.
                </p>

                <h2>Why we need it</h2>
                <dl>
                    <dt>Name</dt>
                    <dd>To confirm your registration to you and greet you when you sign in.</dd>
                    <dt>Date of birth</dt>
                    <dd>
                        To confirm you are aged {MIN_AGE} to {MAX_AGE}, the eligibility range for
                        this election. It is also part of how you sign in.
                    </dd>
                    <dt>Mobile number</dt>
                    <dd>
                        To make sure one person cannot register twice, and as the identifier you
                        sign in with.
                    </dd>
                    <dt>Constituency</dt>
                    <dd>To show you the correct candidates.</dd>
                </dl>

                <h2>How long we keep it</h2>
                <p>
                    Registration records are kept for twelve months after the election closes, so
                    that any challenge to the result can be investigated. They are then deleted.
                    Ballots are anonymous from the moment they are cast and are retained
                    indefinitely as the record of the result.
                </p>

                <h2>Who can see it</h2>
                <p>
                    Only the Electoral Commission, and only the register: names, numbers,
                    constituencies and whether each person has voted. Administrator access to the
                    register is logged. We do not sell your data, and we do not share it with
                    political parties, campaigns or advertisers.
                </p>

                <h2>Cookies</h2>
                <p>
                    This service sets one cookie when you register or sign in. It holds a signed
                    session token, it cannot be read by scripts in your browser, and it expires
                    after 30 minutes or as soon as your ballot is cast, whichever comes first. It
                    is strictly necessary for the service to work, so there is no cookie banner
                    and nothing to opt out of. We use no analytics, advertising or tracking
                    cookies.
                </p>

                <h2>Your rights</h2>
                <p>
                    Under the Data Protection Act 2012 (Act 843) you may ask for a copy of the
                    registration data held about you, ask for it to be corrected, or ask for it to
                    be erased. Erasure before the election closes will remove your registration
                    and you will not be able to vote. Because ballots are anonymous, a ballot
                    already cast cannot be identified or withdrawn.
                </p>
                <p>
                    Write to{' '}
                    <a href="mailto:aakwadwo1@gmail.com">
                        aakwadwo1@gmail.com
                    </a>
                    . We respond within 30 days. If you are not satisfied, you can complain to the
                    Data Protection Commission of Ghana.
                </p>
            </Prose>
        </PageShell>
    )
}
