import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { PageShell, PageHeading } from '@/components/layout/PageShell'

export const metadata = { title: 'Page not found' }

export default function NotFound() {
    return (
        <PageShell width="sm">
            <PageHeading
                title="Page not found"
                description="The link may be out of date."
            />
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                    <Link href="/register">Register to vote</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                    <Link href="/login">Sign in to vote</Link>
                </Button>
            </div>
        </PageShell>
    )
}
