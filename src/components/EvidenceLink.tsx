import { truncateMiddle } from '../format';
import type { TestRun } from '../sdk/types';

/** Best-effort L1 explorer link for a 64-hex txid on testnet/mainnet. */
function explorerUrl(txid: string, network: string | null): string | null {
  if (!/^[0-9a-fA-F]{64}$/.test(txid)) return null;
  if (network === 'mainnet') return `https://insight.dash.org/insight/tx/${txid}`;
  if (network === 'testnet') return `https://testnet-insight.dashevo.org/insight/tx/${txid}`;
  return null;
}

export function Evidence({ run }: { run: TestRun }) {
  const hasEvidence = run.evidenceUrl || run.txid || run.evidenceText;
  if (!hasEvidence) return <span className="muted">—</span>;

  const txExplorer = run.txid ? explorerUrl(run.txid, run.network) : null;

  return (
    <span className="evidence">
      {run.evidenceUrl && (
        <a href={run.evidenceUrl} target="_blank" rel="noreferrer noopener" className="evidence-link">
          evidence ↗
        </a>
      )}
      {run.txid &&
        (txExplorer ? (
          <a
            href={txExplorer}
            target="_blank"
            rel="noreferrer noopener"
            className="evidence-link mono"
            title={run.txid}
          >
            {truncateMiddle(run.txid)} ↗
          </a>
        ) : (
          <code className="mono" title={run.txid}>
            {truncateMiddle(run.txid)}
          </code>
        ))}
      {run.evidenceText && (
        <code className="mono" title={run.evidenceText}>
          {run.evidenceText.length > 28 ? truncateMiddle(run.evidenceText, 16, 10) : run.evidenceText}
        </code>
      )}
    </span>
  );
}
