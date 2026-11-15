// Plan morning-digest, § 1. The contract the reader and every part of § 2 are written against.
// Declarations only: the working readNight is exported from ./read.ts.

export type RunStatus = 'ok' | 'retry' | 'fail';

// One row per job for one night.
export type DigestRow = {
  job: string;
  owner: string | null;
  /** Every log line for the job, retries included. */
  runs: number;
  /** Lines with status `retry`. */
  retries: number;
  /** Lines with status `fail`. */
  fails: number;
  lastStatus: RunStatus;
  /** The most recent `error` on any line of the job, or null if it never had one. */
  lastError: string | null;
  /** Earliest and latest `at` for the job, exactly as the log wrote them (offset kept). */
  firstAt: string;
  lastAt: string;
};

export type NightDigest = {
  /** `YYYY-MM-DD`, the name of the file without `.jsonl`. */
  night: string;
  /** Sorted by `job`. The page and the JSON both keep this order. */
  rows: DigestRow[];
  /** Lines that could not be read. Counted, never thrown. */
  badLines: number;
  /** Log lines by status, over the lines that could be read. */
  counts: { ok: number; retry: number; fail: number };
};

/** Reads `<runsDir>/<night>.jsonl`. Returns null when there is no file for that night. */
export type ReadNight = (runsDir: string, night: string) => NightDigest | null;
