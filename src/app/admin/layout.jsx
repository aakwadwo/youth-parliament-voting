export const metadata = {
    title: {
        default: 'Admin portal',
        template: '%s — Admin portal',
    },
    robots: { index: false, follow: false, nocache: true },
}

export default function AdminLayout({ children }) {
    return children
}
