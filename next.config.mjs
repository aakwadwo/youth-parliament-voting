// Candidate photos are uploaded to Supabase Storage and served from the
// project's own subdomain, so next/image needs that host explicitly allowed.
const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
    : null

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactCompiler: true,

    // Nothing gains from advertising the framework version to every scanner.
    poweredByHeader: false,

    images: {
        remotePatterns: supabaseHostname
            ? [
                  {
                      protocol: 'https',
                      hostname: supabaseHostname,
                      pathname: '/storage/v1/object/public/**',
                  },
              ]
            : [],
        // Candidate photographs are immutable once uploaded (each upload gets a
        // fresh random filename), so the optimizer can cache them hard.
        minimumCacheTTL: 60 * 60 * 24 * 30,
        formats: ['image/avif', 'image/webp'],
        // An SVG here would execute script in the context of our own origin.
        dangerouslyAllowSVG: false,
    },

    // pdfkit reads its font metrics from disk at require time; tracing them
    // explicitly keeps the report export working on a serverless deployment,
    // where untraced files are not included in the bundle.
    outputFileTracingIncludes: {
        '/api/admin/results/export': ['./node_modules/pdfkit/js/data/**'],
    },

    experimental: {
        // Only the icons actually imported are bundled, rather than the whole
        // lucide barrel file.
        optimizePackageImports: ['lucide-react'],
    },
}

export default nextConfig
