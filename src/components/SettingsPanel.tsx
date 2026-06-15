import { useState } from 'react';
import type { AppConfig, Network } from '../config';
import { clearOverride, saveOverride } from '../config';

const NETWORKS: Network[] = ['testnet', 'mainnet', 'devnet', 'local'];

interface Props {
  config: AppConfig;
  onApply: () => void;
  /** Render expanded by default (e.g. when the dashboard is unconfigured). */
  startOpen?: boolean;
}

export function SettingsPanel({ config, onApply, startOpen = false }: Props) {
  const [open, setOpen] = useState(startOpen);
  const [contractId, setContractId] = useState(config.contractId);
  const [network, setNetwork] = useState<Network>(config.network);
  const [devnetName, setDevnetName] = useState(config.devnetName ?? '');

  const apply = () => {
    saveOverride({
      contractId: contractId.trim(),
      network,
      devnetName: network === 'devnet' ? devnetName.trim() || undefined : undefined,
    });
    onApply();
  };

  const reset = () => {
    clearOverride();
    onApply();
  };

  const loadDemo = () => {
    saveOverride({ contractId: 'demo', network: 'testnet', devnetName: undefined });
    onApply();
  };

  if (!open) {
    return (
      <button type="button" className="link-button settings-toggle" onClick={() => setOpen(true)}>
        ⚙ Data source
      </button>
    );
  }

  return (
    <section className="settings-panel" aria-label="Data source settings">
      <div className="settings-row">
        <label className="field">
          <span>Network</span>
          <select value={network} onChange={(e) => setNetwork(e.target.value as Network)}>
            {NETWORKS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        {network === 'devnet' && (
          <label className="field">
            <span>Devnet name</span>
            <input
              type="text"
              value={devnetName}
              placeholder="e.g. paloma"
              onChange={(e) => setDevnetName(e.target.value)}
            />
          </label>
        )}

        <label className="field grow">
          <span>dash-qa contract id</span>
          <input
            type="text"
            className="mono"
            value={contractId}
            placeholder="base58 contract id from contract-id.testnet.json"
            onChange={(e) => setContractId(e.target.value)}
            spellCheck={false}
          />
        </label>
      </div>

      <div className="settings-actions">
        <button type="button" className="primary" onClick={apply} disabled={!contractId.trim()}>
          Apply &amp; load
        </button>
        <button type="button" className="link-button" onClick={loadDemo}>
          Load demo data
        </button>
        <button type="button" className="link-button" onClick={reset}>
          Reset to defaults
        </button>
        <button type="button" className="link-button" onClick={() => setOpen(false)}>
          Close
        </button>
      </div>
      <p className="settings-hint">
        Overrides are stored in your browser only. For a fixed deploy, set the{' '}
        <code>CONTRACT_ID</code> build variable or commit a <code>public/config.json</code>.
      </p>
    </section>
  );
}
