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

    // pdfkit resolves its built-in AFM font metrics relative to its own
    // __dirname. Bundled into the server chunk that __dirname is rewritten to a
    // synthetic '/ROOT/...' prefix, so `new PDFDocument()` threw ENOENT on
    // Helvetica.afm before it had drawn anything — every PDF export returned
    // 500 in a production build while Excel and CSV, which touch no fonts,
    // succeeded. Keeping pdfkit out of the bundle leaves it a plain node_modules
    // require with a real __dirname.
    // sharp is a native module and must not be bundled either. It is already
    // present as Next's own optional dependency (the image optimizer uses it);
    // package.json now depends on it explicitly, because the candidate register
    // export downscales photographs with it and a transitive optional
    // dependency is not something an export route should be resting on.
    serverExternalPackages: ['pdfkit', 'sharp'],

    // Belt and braces for serverless: the metrics live in a directory nothing
    // statically imports, so file tracing has to be told to ship them.
    outputFileTracingIncludes: {
        '/api/admin/results/export': ['./node_modules/pdfkit/js/data/**'],
        '/api/admin/candidates/export': ['./node_modules/pdfkit/js/data/**'],
    },

    experimental: {
        // Only the icons actually imported are bundled, rather than the whole
        // lucide barrel file.
        optimizePackageImports: ['lucide-react'],
    },
}

export default nextConfig
