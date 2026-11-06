#!/usr/bin/env node
/**
 * One-off: copy every file from the old Supabase project's Storage into R2,
 * where the apps now look for them ("<bucket>/<path>" in us-media).
 *
 *   node scripts/copy-old-storage.mjs [old-project-ref]
 *
 * The old project (wucadjgznsoypbzpaeaq) was cut off for going over the free
 * plan's egress and only answers again once its quota refills (20 Nov 2026).
 * Needs the Supabase CLI logged in and wrangler logged in (WRANGLER is its
 * bin/wrangler.js, run with node so it also works on Windows).
 * Files already in R2 are skipped, so it's safe to run again.
 */
import { createClient } from '@supabase/supabase-js';
import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ref = process.argv[2] ?? 'wucadjgznsoypbzpaeaq';
const WRANGLER = process.env.WRANGLER ?? 'C:/Users/jonal/AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/bin/wrangler.js';
const BUCKETS = ['memories', 'chat', 'snaps', 'drawings', 'birthday'];

const secret = JSON.parse(
  execSync(`npx supabase projects api-keys --project-ref ${ref} --reveal -o json`, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString(),
).find((k) => k.type === 'secret').api_key;
const old = createClient(`https://${ref}.supabase.co`, secret, { auth: { persistSession: false } });

/** Every file path in a bucket (folders are walked). */
async function list(bucket, prefix = '') {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await old.storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`${bucket}/${prefix}: ${error.message}`);
    for (const f of data ?? []) {
      const path = prefix ? `${prefix}/${f.name}` : f.name;
      if (f.id) out.push({ path, type: f.metadata?.mimetype ?? 'application/octet-stream' });
      else out.push(...(await list(bucket, path)));
    }
    if ((data ?? []).length < 1000) return out;
  }
}

const wrangler = (args) => execFileSync(process.execPath, [WRANGLER, ...args], { cwd: join(root, 'workers/media'), stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const exists = (key) => {
  try {
    wrangler(['r2', 'object', 'get', `us-media/${key}`, '--remote', '--pipe']);
    return true;
  } catch {
    return false;
  }
};

const dir = mkdtempSync(join(tmpdir(), 'us-copy-'));
let copied = 0;
let skipped = 0;
try {
  for (const bucket of BUCKETS) {
    for (const { path, type } of await list(bucket)) {
      const key = `${bucket}/${path}`;
      if (exists(key)) {
        skipped++;
        continue;
      }
      const { data, error } = await old.storage.from(bucket).download(path);
      if (error) throw new Error(`${key}: ${error.message}`);
      const file = join(dir, 'f');
      writeFileSync(file, new Uint8Array(await data.arrayBuffer()));
      wrangler(['r2', 'object', 'put', `us-media/${key}`, '--remote', '--file', file, '--content-type', type]);
      copied++;
      console.log(`  ${key}`);
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`copied ${copied}, already there ${skipped}`);
