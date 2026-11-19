// @ts-nocheck -- reads files with Node's APIs, which this package doesn't type.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Pure modules the Edge Functions keep their own copy of (their bundle can't reach packages/).
const COPIES = [['src/recurrence.ts', '../../supabase/functions/_shared/recurrence.ts']];

describe('copies shared with the Edge Functions', () => {
  it.each(COPIES)('%s is the same as its copy', (here, there) => {
    const root = join(__dirname, '..');
    expect(readFileSync(join(root, there), 'utf8')).toBe(readFileSync(join(root, here), 'utf8'));
  });
});
