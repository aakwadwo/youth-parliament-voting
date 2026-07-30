import { register } from 'node:module'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

/**
 * Teaches plain Node the `@/*` -> `src/*` alias that jsconfig.json declares for
 * the bundler, so the library modules can be unit tested without Next.js or a
 * build step in the way.
 *
 * Also restores the extensionless imports the bundler resolves but the Node ESM
 * loader does not.
 *
 * Registered via `node --import ./tests/alias-loader.mjs`.
 */
const SRC = pathToFileURL(path.join(process.cwd(), 'src') + path.sep).href

register(
    `data:text/javascript,
    import { existsSync } from 'node:fs';
    import { fileURLToPath } from 'node:url';

    const SRC = ${JSON.stringify(SRC)};

    export async function resolve(specifier, context, next) {
      let target = specifier;
      if (target.startsWith('@/')) {
        target = SRC + target.slice(2);
      } else if (!target.startsWith('.') && !target.startsWith('file:')) {
        return next(specifier, context);
      }

      try {
        return await next(target, context);
      } catch (error) {
        if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
        for (const suffix of ['.js', '.jsx', '/index.js']) {
          try {
            return await next(target + suffix, context);
          } catch {}
        }
        throw error;
      }
    }`,
    import.meta.url
)
