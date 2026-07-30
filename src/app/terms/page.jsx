import { PageShell, PageHeading } from '@/components/layout/PageShell'
import { Prose, LastUpdated } from '@/components/layout/Prose'
import { MIN_AGE, MAX_AGE } from '@/lib/validation'

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
            <LastUpdated date="2026-07-30" />

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
                    <a href="mailto:elections@youthparliament.gov.gh">
                        elections@youthparliament.gov.gh
                    </a>
                    .
                </p>
            </Prose>
        </PageShell>
    )
}
