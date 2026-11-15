import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { NightDigest } from '../src/digest/types.js';

// Job names are chosen so none is a substring of another, so indexOf order is reliable.
const populatedNight = '2026-10-28';
// Sorted by job, as readNight returns them.
const populatedJobs = ['backup-nightly', 'cache-warm', 'ledger-close', 'mail-digest', 'thumbnail-sweep'];
const emptyNight = '2026-10-29';
const missingNight = '2026-10-30';

const populatedLines = [
  '{"at":"2026-10-28T01:00:00+01:00","job":"backup-nightly","status":"ok","owner":"ops"}',
  '{"at":"2026-10-28T01:05:00+01:00","job":"thumbnail-sweep","status":"retry","owner":"media","error":"timeout"}',
  '{"at":"2026-10-28T01:07:00+01:00","job":"thumbnail-sweep","status":"retry","owner":"media","error":"timeout"}',
  '{"at":"2026-10-28T01:09:00+01:00","job":"thumbnail-sweep","status":"ok","owner":"media"}',
  '{"at":"2026-10-28 01:10 this line does not parse',
  '{"at":"2026-10-28T01:10:00+01:00","job":"ledger-close","status":"fail","owner":null,"error":"db locked"}',
  '{"at":"2026-10-28T02:00:00+01:00","job":"mail-digest","status":"ok","owner":"comms"}',
  '{"at":"2026-10-28T02:30:00+01:00","job":"cache-warm","status":"ok","owner":"ops"}',
].join('\n');

let runsDir: string;

function appFor(dir: string) {
  return createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir: dir,
  });
}

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  writeFileSync(join(runsDir, `${populatedNight}.jsonl`), populatedLines + '\n');
  writeFileSync(join(runsDir, `${emptyNight}.jsonl`), '');
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('GET /digest/:night', () => {
  it('returns 200 for a night that has a file', async () => {
    const res = await appFor(runsDir).request(`/digest/${populatedNight}`);
    expect(res.status).toBe(200);
  });

  it('lists every job of a night with a bad line, and the good rows are there', async () => {
    const res = await appFor(runsDir).request(`/digest/${populatedNight}`);
    const html = await res.text();
    for (const job of populatedJobs) {
      expect(html).toContain(job);
    }
  });

  it('lists the jobs in the same order as the JSON', async () => {
    const page = await (await appFor(runsDir).request(`/digest/${populatedNight}`)).text();
    const json = (await (await appFor(runsDir).request(`/api/digest/${populatedNight}`)).json()) as NightDigest;
    const positions = json.rows.map((row) => page.indexOf(row.job));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it('returns 404 for a night with no file', async () => {
    const res = await appFor(runsDir).request(`/digest/${missingNight}`);
    expect(res.status).toBe(404);
  });

  it('returns 200 for the empty night and says nothing ran', async () => {
    const res = await appFor(runsDir).request(`/digest/${emptyNight}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns 200 for a night that has a file', async () => {
    const res = await appFor(runsDir).request(`/api/digest/${populatedNight}`);
    expect(res.status).toBe(200);
  });

  it('returns the good rows and counts the bad line in badLines', async () => {
    const res = await appFor(runsDir).request(`/api/digest/${populatedNight}`);
    const body = (await res.json()) as NightDigest;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((row) => row.job)).toEqual(populatedJobs);
  });

  it('returns 404 with an error body for a night with no file', async () => {
    const res = await appFor(runsDir).request(`/api/digest/${missingNight}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });

  it('returns 200 with rows: [] for the empty night', async () => {
    const res = await appFor(runsDir).request(`/api/digest/${emptyNight}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as NightDigest;
    expect(body.rows).toEqual([]);
  });
});
