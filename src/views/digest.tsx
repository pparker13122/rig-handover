import type { NightDigest } from '../digest/types.js';

const RETRY_MARK = 3;

// Missing data reads as an em dash, never as an empty cell.
function orDash(value: string | null): string {
  return value ?? '—';
}

export function DigestPage({ digest }: { digest: NightDigest }) {
  return (
    <>
      <h1>digest {digest.night}</h1>
      {digest.badLines > 0 ? (
        <p class="warn">
          {digest.badLines} {digest.badLines === 1 ? 'line' : 'lines'} could not be read.
        </p>
      ) : null}
      {digest.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first</th>
              <th>last</th>
            </tr>
          </thead>
          <tbody>
            {digest.rows.map((row) => (
              <tr>
                <td>{row.job}</td>
                <td>{orDash(row.owner)}</td>
                <td>{row.runs}</td>
                <td>
                  {row.retries >= RETRY_MARK ? (
                    <span class="warn">{row.retries} (retried {RETRY_MARK}+ times)</span>
                  ) : (
                    row.retries
                  )}
                </td>
                <td>
                  {row.fails > 0 ? (
                    <span class="warn">
                      {row.lastStatus} ({row.fails} {row.fails === 1 ? 'fail' : 'fails'})
                    </span>
                  ) : (
                    row.lastStatus
                  )}
                </td>
                <td>{orDash(row.lastError)}</td>
                <td>{row.firstAt}</td>
                <td>{row.lastAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
