import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

import { DRAFT } from './apps/page/src/copy.ts';

const path = (file: string) => fileURLToPath(new URL(file, import.meta.url));

/**
 * Where the page is published: the owner's pick of 2026-11-09, his studio's site. A link preview needs the image's
 * absolute address (og:image, og:url); everything else on the page is relative, so it works from this subpath or any
 * other. Change it here if the address changes.
 */
const PAGE_URL = 'https://frederickdesign.studio/lightline/';

const TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/**
 * The page's own public files in apps/page/public (the link preview's image), beside the workbench's that both share:
 * served in development and copied into the build. Its looks/ folder holds the licensed pictures and loops for the
 * Suite's room with a looks.json beside them; it is ignored by git and never committed (the license forbids redistributing them
 * with source files), and copied only when it is there. Without it the page shows the skin's own room and no switcher.
 */
function pagePublic(): Plugin {
  const dir = path('./apps/page/public');
  return {
    name: 'lightline-page-public',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? '/').split('?')[0]!);
        const file = resolve(dir, `.${url}`);
        const type = TYPES[extname(file).toLowerCase()];
        const there = file.startsWith(dir + sep) && !!type && existsSync(file) && statSync(file).isFile();
        if (!there) {
          // A look that is not there is not found, rather than the page's index in its place.
          if (url.startsWith('/looks/')) {
            res.statusCode = 404;
            res.end();
          } else next();
          return;
        }
        res.setHeader('Content-Type', type);
        res.setHeader('Accept-Ranges', 'bytes');
        // A loop is read in ranges, as a browser seeks through it.
        const size = statSync(file).size;
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
        if (range && (range[1] || range[2])) {
          const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
          const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
          if (start > end || start >= size) {
            res.statusCode = 416;
            res.setHeader('Content-Range', `bytes */${size}`);
            res.end();
            return;
          }
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
          res.setHeader('Content-Length', end - start + 1);
          createReadStream(file, { start, end }).pipe(res);
          return;
        }
        res.setHeader('Content-Length', size);
        createReadStream(file).pipe(res);
      });
    },
    writeBundle(options) {
      if (existsSync(dir) && options.dir) cpSync(dir, options.dir, { recursive: true });
    },
  };
}

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The page's head takes its words from the DRAFT copy, so every word on the page is in one place for the copy check. */
function head(): Plugin {
  const words: Record<string, string> = {
    pageTitle: DRAFT.pageTitle,
    description: DRAFT.description,
    ogImageAlt: DRAFT.ogImageAlt,
    url: PAGE_URL,
  };
  return {
    name: 'lightline-page-head',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replace(/\{\{(\w+)\}\}/g, (all, key: string) => (key in words ? escape(words[key]!) : all)),
    },
  };
}

// The presentation page (apps/page): its own entry, built on the skin in src/ as a consumer would use it, to static
// files at the root of dist (the workbench builds after it, into dist/workbench). It shares the workbench's public
// folder, where the films' tracks and peaks live, and adds its own (apps/page/public).
export default defineConfig({
  root: path('./apps/page'),
  base: './',
  publicDir: path('./apps/preview/public'),
  plugins: [react(), pagePublic(), head()],
  resolve: {
    alias: { '@': path('./src') },
  },
  server: {
    fs: { allow: [path('.')] },
  },
  build: {
    outDir: path('./dist'),
    emptyOutDir: true,
  },
});
