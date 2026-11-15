import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightDigest, ReadNight, RunStatus } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

type LogLine = {
  at: string;
  /** `at` as epoch ms, for ordering only. The string is what gets kept. */
  time: number;
  job: string;
  status: RunStatus;
  owner: string | null;
  error: string | null;
};

function isStatus(v: unknown): v is RunStatus {
  return v === 'ok' || v === 'retry' || v === 'fail';
}

// The edge: one raw line in, a typed LogLine or null (a bad line) out.
function parseLine(raw: string): LogLine | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;

  const { at, job, status, owner = null, error = null } = o;
  if (typeof at !== 'string' || at === '') return null;
  const time = Date.parse(at);
  if (Number.isNaN(time)) return null;
  if (typeof job !== 'string' || job === '') return null;
  if (!isStatus(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== null && typeof error !== 'string') return null;

  return { at, time, job, status, owner, error };
}

function readFile(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (e) {
    if (e instanceof Error && 'code' in e && e.code === 'ENOENT') return null;
    throw e;
  }
}

function toRow(lines: LogLine[]): DigestRow {
  // Stable sort: lines with the same instant keep file order, so the later line wins "last".
  const byTime = [...lines].sort((a, b) => a.time - b.time);
  const first = byTime[0]!;
  const last = byTime[byTime.length - 1]!;
  let lastError: string | null = null;
  for (const l of byTime) if (l.error !== null) lastError = l.error;
  return {
    job: last.job,
    owner: last.owner,
    runs: lines.length,
    retries: lines.filter((l) => l.status === 'retry').length,
    fails: lines.filter((l) => l.status === 'fail').length,
    lastStatus: last.status,
    lastError,
    firstAt: first.at,
    lastAt: last.at,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) return null;
  const text = readFile(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  const byJob = new Map<string, LogLine[]>();
  const counts = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;

  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line === null) {
      badLines++;
      continue;
    }
    counts[line.status]++;
    const group = byJob.get(line.job);
    if (group) group.push(line);
    else byJob.set(line.job, [line]);
  }

  const rows = [...byJob.values()].map(toRow).sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, badLines, counts };
};
