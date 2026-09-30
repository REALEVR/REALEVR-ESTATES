#!/usr/bin/env node
/**
 * Rebuilds server/templates/tour-viewer/psv-viewer.{js,css} - the 360 viewer
 * (Photo Sphere Viewer + its gyroscope/stereo plugins + three.js) that every
 * phone-captured tour loads. Run this only to upgrade the viewer; the output
 * is committed, so a normal build never needs it.
 *
 *   node scripts/build-tour-viewer.mjs
 *
 * Why a bundle instead of a CDN <script>: Photo Sphere Viewer no longer
 * ships a browser-global build that includes three.js, and three.js itself
 * dropped its global build after r160, so there is no working CDN tag for a
 * current version. Bundling them with esbuild (already a dependency here)
 * gives one self-contained file and pins the exact versions below.
 *
 * Installs into a temp folder, so package.json / the lockfile are untouched.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Keep these in step: the plugins and core must be the same version, and
// three must satisfy core's peer range (check `npm view <core> peerDependencies`).
const PSV_VERSION = '5.15.1';
const THREE_VERSION = '0.185.1';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'server', 'templates', 'tour-viewer');
const work = mkdtempSync(path.join(tmpdir(), 'tour-viewer-'));

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

writeFileSync(path.join(work, 'package.json'), '{"name":"tour-viewer-build","private":true}');
run(
  'npm',
  [
    'install', '--no-audit', '--no-fund', '--save-exact',
    `@photo-sphere-viewer/core@${PSV_VERSION}`,
    `@photo-sphere-viewer/gyroscope-plugin@${PSV_VERSION}`,
    `@photo-sphere-viewer/stereo-plugin@${PSV_VERSION}`,
    `three@${THREE_VERSION}`,
  ],
  work
);

// Exposed as a plain global so the tour page can stay a classic <script>.
writeFileSync(
  path.join(work, 'entry.js'),
  `import { Viewer } from '@photo-sphere-viewer/core'
import { GyroscopePlugin } from '@photo-sphere-viewer/gyroscope-plugin'
import { StereoPlugin } from '@photo-sphere-viewer/stereo-plugin'
window.PhotoSphereViewer = { Viewer, GyroscopePlugin, StereoPlugin }
`
);

mkdirSync(outDir, { recursive: true });
run(
  path.join(root, 'node_modules', '.bin', 'esbuild'),
  [
    'entry.js', '--bundle', '--format=iife', '--minify', '--target=es2020', '--legal-comments=none',
    `--outfile=${path.join(outDir, 'psv-viewer.js')}`,
  ],
  work
);
copyFileSync(
  path.join(work, 'node_modules', '@photo-sphere-viewer', 'core', 'index.css'),
  path.join(outDir, 'psv-viewer.css')
);

console.log(`\nBuilt Photo Sphere Viewer ${PSV_VERSION} + three ${THREE_VERSION} into ${outDir}`);
console.log('Update THIRD_PARTY_LICENSES.txt in that folder if either version changed.');
