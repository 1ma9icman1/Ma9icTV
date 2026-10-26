const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const distDir = path.join(root, 'dist');
const publicDir = path.join(root, 'public');

if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error('[Vercel build] dist/index.html is missing. Run the Vite build first.');
  process.exit(1);
}

// Vercel serves files from /public via its CDN. Keep the regular Vite build
// output in /dist for GitHub Pages and copy it only for the Vercel build.
fs.mkdirSync(publicDir, { recursive: true });
fs.cpSync(distDir, publicDir, { recursive: true, force: true });

console.log('[Vercel build] Copied the Vite frontend from dist/ to public/.');
