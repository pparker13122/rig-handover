import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const digest = readNight('runs', '2026-10-28');

  it('reads 5 jobs and 1 bad line', () => {
    expect(digest).not.toBeNull();
    expect(digest!.night).toBe('2026-10-28');
    expect(digest!.rows).toHaveLength(5);
    expect(digest!.badLines).toBe(1);
    expect(digest!.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('sorts rows by job and keeps the log times as written', () => {
    expect(digest!.rows).toEqual([
      {
        job: 'digest/render', owner: null, runs: 1, retries: 0, fails: 0, lastStatus: 'ok',
        lastError: null, firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00',
      },
      {
        job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, fails: 0, lastStatus: 'ok',
        lastError: 'upstream 503', firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
      },
      {
        job: 'lane/sync', owner: 'rook', runs: 8, retries: 1, fails: 0, lastStatus: 'ok',
        lastError: 'lock held', firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00',
      },
      {
        job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0, fails: 1, lastStatus: 'fail',
        lastError: 'quota exceeded', firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00',
      },
      {
        job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0, fails: 0, lastStatus: 'ok',
        lastError: null, firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00',
      },
    ]);
  });
});

describe('readNight edge cases', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const write = (night: string, lines: string[]) => writeFileSync(join(dir, `${night}.jsonl`), lines.join('\n'));
  const line = (o: Record<string, unknown>) => JSON.stringify(o);

  it('returns null when there is no file for the night', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('returns null for a night that is not YYYY-MM-DD, without reading outside runsDir', () => {
    writeFileSync(join(dir, 'secret.jsonl'), line({ at: '2026-01-01T00:00:00Z', job: 'x', status: 'ok', owner: null }));
    const inner = join(dir, 'inner');
    for (const night of ['../secret', 'secret', '2026-1-01', '2026-01-01.jsonl', '', '2026-01-01/../x']) {
      expect(readNight(inner, night)).toBeNull();
      expect(readNight(dir, night)).toBeNull();
    }
  });

  it('an empty file gives no rows and no bad lines', () => {
    write('2026-01-01', []);
    expect(readNight(dir, '2026-01-01')).toEqual({
      night: '2026-01-01', rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('skips blank lines without counting them', () => {
    write('2026-01-01', ['', '   ', line({ at: '2026-01-01T01:00:00+01:00', job: 'a', status: 'ok', owner: 'x' }), '', '\r']);
    const d = readNight(dir, '2026-01-01')!;
    expect(d.badLines).toBe(0);
    expect(d.rows).toHaveLength(1);
  });

  it('counts valid JSON with no at, no job or an unknown status as bad lines', () => {
    write('2026-01-01', [
      line({ job: 'a', status: 'ok', owner: null }),
      line({ at: '2026-01-01T01:00:00+01:00', status: 'ok', owner: null }),
      line({ at: '2026-01-01T01:00:00+01:00', job: 'a', status: 'skipped', owner: null }),
      line({ at: '2026-01-01T01:00:00+01:00', job: 'a', owner: null }),
      '[1,2]',
      'null',
      '{"at":',
      line({ at: '2026-01-01T02:00:00+01:00', job: 'a', status: 'ok', owner: null }),
    ]);
    const d = readNight(dir, '2026-01-01')!;
    expect(d.badLines).toBe(7);
    expect(d.rows.map((r) => r.job)).toEqual(['a']);
    expect(d.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
  });

  it('keeps a row whose owner is null', () => {
    write('2026-01-01', [line({ at: '2026-01-01T01:00:00+01:00', job: 'a', status: 'fail', owner: null, error: 'boom' })]);
    const [row] = readNight(dir, '2026-01-01')!.rows;
    expect(row).toMatchObject({ job: 'a', owner: null, fails: 1, lastStatus: 'fail', lastError: 'boom' });
  });

  it('orders by time, not file order, and keeps the offset as written', () => {
    write('2026-01-01', [
      line({ at: '2026-01-01T03:00:00+01:00', job: 'a', status: 'ok', owner: 'x' }),
      line({ at: '2026-01-01T01:00:00+01:00', job: 'a', status: 'retry', owner: 'x', error: 'early' }),
      line({ at: '2026-01-01T02:00:00+01:00', job: 'a', status: 'fail', owner: 'x', error: 'late' }),
    ]);
    const [row] = readNight(dir, '2026-01-01')!.rows;
    expect(row).toMatchObject({
      runs: 3, retries: 1, fails: 1, lastStatus: 'ok', lastError: 'late',
      firstAt: '2026-01-01T01:00:00+01:00', lastAt: '2026-01-01T03:00:00+01:00',
    });
  });
});
