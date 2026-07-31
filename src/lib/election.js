/**
 * The election this deployment runs.
 *
 * The name was previously written out at each of the six places that needed
 * it — page metadata, the landing headline, the public status endpoint, the
 * report builder, the PDF document properties — which is how the platform
 * ended up describing itself three different ways on three different screens.
 *
 * ELECTION_NAME is the fallback, not the source of truth. Administrators set
 * the live name in Admin → Settings (`election_settings.election_name`), and
 * that value is what voters and the exported report actually show. This
 * constant is what the platform calls the election before anyone has
 * configured it, and what a report falls back to if the row is missing.
 */
export const ELECTION_NAME = 'National Youth Parliament Election 2026'

/** The institution running the election, for mastheads and document authorship. */
export const ORGANISATION_NAME = 'National Youth Parliament of Ghana'

/**
 * The body with legal authority over this election.
 *
 * Copy across the site previously said "the electoral secretariat", which names
 * an administrative office rather than the authority. On a ballot platform that
 * distinction is not cosmetic: it is the Electoral Commission that voters are
 * being asked to trust with the register and the count, and it is the
 * Commission a voter has to be able to name when they complain, request their
 * data, or dispute a result.
 */
export const ELECTORAL_COMMISSION = 'National Youth Parliament Electoral Commission'

/** The firm that built and maintains the platform. Credited, never co-branded. */
export const TECHNOLOGY_PROVIDER = 'Kas Maven Consult'

/** Supplier's own page, linked only from the institutional credit in the footer. */
export const TECHNOLOGY_PROVIDER_URL = 'https://www.linkedin.com/company/kas-maven-consult'

/** Short form for the site masthead, where the full name does not fit. */
export const ORGANISATION_SHORT_NAME = 'Youth Parliament Ghana'
