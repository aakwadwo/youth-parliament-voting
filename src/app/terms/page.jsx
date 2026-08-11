import { PageShell, PageHeading } from '@/components/layout/PageShell'
import { Prose, LastUpdated } from '@/components/layout/Prose'
import { MIN_AGE, MAX_AGE } from '@/lib/validation'
import { ELECTORAL_COMMISSION, CONTACT_EMAIL } from '@/lib/election'

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

                <h2>Sharing a device</h2>
                <p>
                    More than one person may register from the same phone or computer. We know that
                    many voters will register from a friend&apos;s phone, a family phone, a school
                    computer or an internet café, and the service is built to allow it. Where
                    possible, complete one registration per device, so that everyone waiting to use
                    it gets through.
                </p>
                <p>
                    Registration is separately protected against automated and bulk abuse, so a
                    device used for a large number of registrations in a short time may be asked to
                    wait before another can be completed. This is an anti-abuse measure and not a
                    judgement about anyone: if you have not registered before and cannot complete
                    your registration, contact the {ELECTORAL_COMMISSION} and we will help you.
                </p>
                <p>
                    None of this affects voting. Once you are registered you can sign in and cast
                    your ballot from any device, whether or not you registered on it, and several
                    registered voters may vote one after another from the same device.
                </p>

                <h2>Technical measures we use</h2>
                <p>
                    The {ELECTORAL_COMMISSION} uses technical measures to protect the integrity of
                    the election and to prevent duplicate, bulk or automated registration. These
                    include limits on how often registration and sign-in may be attempted, and
                    checks that recognise repeated registration from the same place or equipment.
                    We do not publish the thresholds these checks use, because doing so would tell
                    anyone trying to abuse the service exactly how to stay under them.
                </p>
                <p>
                    These checks record only what is needed to detect repeated use, and only for as
                    long as that takes. They do not record your location, they do not build a
                    profile of you, and they play no part in deciding whether your ballot is
                    accepted. How your information is handled is set out in the{' '}
                    <a href="/privacy">privacy notice</a>.
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
                    <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
                    .
                </p>
            </Prose>
        </PageShell>
    )
}
