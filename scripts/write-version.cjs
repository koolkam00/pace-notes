#!/usr/bin/env node
/**
 * Writes public/version.json before `next build`, so the static export says which commit it was built from:
 *
 *   { "sha": "<commit>", "ref": "<branch or null>", "builtAt": "<ISO time>" }
 *
 * Vercel sets VERCEL_GIT_COMMIT_SHA and VERCEL_GIT_COMMIT_REF; local builds fall back to git, and to "unknown" / null
 * without it. The autopilot smoke test (scripts/autopilot-smoke.cjs --expect-sha) and the merge workflow read it to
 * confirm that a preview or production deploy serves the commit they expect. The file is ignored by git, served with
 * Cache-Control: no-store and X-Robots-Tag: noindex (vercel.json), and is not in the sitemap. See docs/AUTOPILOT.md.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'public', 'version.json');

function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

const version = {
  sha: process.env.VERCEL_GIT_COMMIT_SHA || git(['rev-parse', 'HEAD']) || 'unknown',
  ref: process.env.VERCEL_GIT_COMMIT_REF || git(['branch', '--show-current']) || null,
  builtAt: new Date().toISOString(),
};

fs.mkdirSync(path.dirname(FILE), { recursive: true });
fs.writeFileSync(FILE, `${JSON.stringify(version, null, 2)}\n`);
console.log(`write-version: public/version.json sha ${version.sha}${version.ref ? ` (${version.ref})` : ''}`);
