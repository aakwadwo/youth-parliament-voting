import { PageShell, PageHeading } from '@/components/layout/PageShell'
import { Prose, LastUpdated } from '@/components/layout/Prose'
import { MIN_AGE, MAX_AGE } from '@/lib/validation'
import { ELECTORAL_COMMISSION } from '@/lib/election'

export const metadata = {
    title: 'Terms of use',
    description:
        'The rules for using the National Youth Parliament of Ghana voting platform.',
}

export default function TermsPage() {
    return (
        <PageShell width="lg">
            <PageHeading
                title="Terms of use"
                description="The rules for using this service."
            />
            <LastUpdated date="2026-07-31" />

            <Prose className="mt-8">
                <h2>Who may use this service</h2>
                <p>
                    This service is for Ghanaian citizens aged {MIN_AGE} to {MAX_AGE} who are
                    entitled to vote in National Youth Parliament elections. By registering you
                    confirm that you meet those conditions and that the details you give are your
                    own and are accurate.
                </p>

                <h2>One person, one vote</h2>
                <p>
                    You may register once, using one mobile number, and cast one ballot in the
                    constituency you registered in. Once submitted, a ballot is final. It cannot
                    be changed, withdrawn or recast, because it carries nothing that would allow
                    us to find it again.
                </p>

                <h2>What is not allowed</h2>
                <ul>
                    <li>registering more than once, or registering on behalf of someone else</li>
                    <li>giving a false name, date of birth or constituency</li>
                    <li>
                        attempting to gain access to another person&apos;s registration or to the
                        administrative area
                    </li>
                    <li>
                        automated access, scripted registration, or any attempt to submit ballots
                        other than through this website
                    </li>
                    <li>
                        interfering with the availability of the service for other voters, or
                        attempting to alter, delete or fabricate results
                    </li>
                </ul>
                <p>
                    Attempting to cast more than one ballot, or to interfere with the conduct of
                    the election, may be an offence. We record and report such attempts.
                </p>

                <h2>One device, one registration</h2>
                <p>
                    Each device may be used to complete one voter registration. If a registration
                    has already been completed on the device you are using, you will not be able to
                    start another one from it. This is an anti-abuse measure, not a judgement about
                    you: if you have not registered before and are prevented from doing so, contact
                    the {ELECTORAL_COMMISSION} and we will help you register.
                </p>
                <p>
                    Households that share a single phone should be aware of this. Where a genuine
                    need to register more than one voter from one device arises, the Commission can
                    arrange it.
                </p>

                <h2>Technical measures we use</h2>
                <p>
                    The {ELECTORAL_COMMISSION} uses technical measures to protect the integrity of
                    the election and to prevent duplicate or automated registration. These include
                    limits on how often registration and sign-in may be attempted, and a check that
                    recognises a device that has already been used to register.
                </p>
                <p>
                    These checks record only what is needed to detect repeated use. They do not
                    record your location, they do not build a profile of you, and they are never
                    connected to the ballot you cast. How your information is handled is set out in
                    the <a href="/privacy">privacy notice</a>.
                </p>

                <h2>Accuracy of the details you give</h2>
                <p>
                    You are responsible for the accuracy of the information you provide. Your name,
                    date of birth, mobile number and constituency must be your own and must be
                    correct. An incorrect constituency means voting in the wrong contest, and an
                    incorrect mobile number means being unable to sign in again.
                </p>
                <p>
                    Where a registration contains information that is false, misleading, incomplete
                    or obviously fictitious, the {ELECTORAL_COMMISSION} may remove it. The
                    Commission may also take other steps that are reasonably necessary to maintain
                    the integrity and fairness of the election. Where a registration is removed and
                    the Commission holds a means of contact, it will say so.
                </p>

                <h2>Availability</h2>
                <p>
                    Voting is only possible while the poll is open. The opening and closing times
                    are shown on every page of this service and are set by the Electoral
                    Commission. We aim to keep the service available throughout, but we do not
                    guarantee uninterrupted access, and we may suspend it briefly for urgent
                    maintenance.
                </p>

                <h2>Accuracy of results</h2>
                <p>
                    Results shown before the poll closes are provisional. The declared result is
                    the one published by the Electoral Commission after voting has closed.
                </p>

                <h2>Changes to these terms</h2>
                <p>
                    We may update these terms. If we change them during an open election, the
                    change will be announced on this service before it takes effect.
                </p>

                <h2>Contact</h2>
                <p>
                    Questions about these terms go to{' '}
                    <a href="mailto:aakwadwo1@gmail.com">
                        aakwadwo1@gmail.com
                    </a>
                    .
                </p>
            </Prose>
        </PageShell>
    )
}
