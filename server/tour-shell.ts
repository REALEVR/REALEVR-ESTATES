/**
 * Renders the thin index.html shell of a phone-captured (generated) tour.
 * Kept separate from both tour-generator.ts (which builds a tour from a
 * capture draft) and s3-tour-hosting.ts (which publishes it and can refresh
 * an already-published tour's shell) so the two can share it without
 * importing each other.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// `__dirname` doesn't exist in ESM (this bundles to an ES module - see
// package.json's "type": "module"); this is the standard equivalent.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** server/templates in dev, dist/templates in the production bundle. */
export const TEMPLATES_DIR = path.join(__dirname, 'templates');

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param viewerBaseUrl where the shared viewer files (psv-viewer.js/css,
 *   tour-app.js/css) are served from - see getTourViewerBaseUrl in
 *   s3-tour-hosting.ts.
 */
export function renderTourShell(title: string, viewerBaseUrl: string): string {
  const template = fs.readFileSync(path.join(TEMPLATES_DIR, 'generated-tour.html'), 'utf8');
  // The viewer URL goes in first so a tour title that happens to contain
  // the placeholder text can't be expanded into it.
  return template
    .split('{{VIEWER_BASE}}')
    .join(viewerBaseUrl)
    .split('{{TOUR_TITLE}}')
    .join(escapeHtml(title));
}
