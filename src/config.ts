// Runtime configuration for the dashboard.
//
// Resolution precedence (highest first):
//   1. In-app override   — what the user typed in Settings (localStorage)
//   2. Runtime config    — public/config.json fetched at startup (no rebuild)
//   3. Build-time env     — VITE_* baked into the bundle
//   4. Hard defaults
//
// This lets a single static deploy be pointed at the seeded dash-qa contract
// (or a different network) without rebuilding — important because the contract
// ID is produced by the sibling "data contract + seed" task.

export type Network = 'testnet' | 'mainnet' | 'devnet' | 'local';

export interface AppConfig {
  network: Network;
  /** dash-qa data contract id (base58). Empty until configured. */
  contractId: string;
  /** Short devnet name, only used when network === 'devnet'. */
  devnetName?: string;
  testCaseDocumentType: string;
  testRunDocumentType: string;
}

const LS_KEY = 'qa-dashboard.config.v1';

const NETWORKS: Network[] = ['testnet', 'mainnet', 'devnet', 'local'];

function asNetwork(value: unknown, fallback: Network): Network {
  return typeof value === 'string' && (NETWORKS as string[]).includes(value)
    ? (value as Network)
    : fallback;
}

function envDefaults(): AppConfig {
  const env = import.meta.env;
  return {
    network: asNetwork(env.VITE_NETWORK, 'testnet'),
    contractId: (env.VITE_CONTRACT_ID ?? '').trim(),
    devnetName: env.VITE_DEVNET_NAME?.trim() || undefined,
    testCaseDocumentType: env.VITE_TESTCASE_DOC_TYPE?.trim() || 'testCase',
    testRunDocumentType: env.VITE_TESTRUN_DOC_TYPE?.trim() || 'testRun',
  };
}

/** Fetch public/config.json (relative to the deploy base). Missing/invalid is fine. */
async function fetchRuntimeConfig(): Promise<Partial<AppConfig>> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}config.json`, {
      cache: 'no-store',
    });
    if (!res.ok) return {};
    const json = (await res.json()) as Record<string, unknown>;
    const out: Partial<AppConfig> = {};
    if (typeof json.network === 'string') out.network = asNetwork(json.network, 'testnet');
    if (typeof json.contractId === 'string') out.contractId = json.contractId.trim();
    if (typeof json.devnetName === 'string') out.devnetName = json.devnetName.trim();
    if (typeof json.testCaseDocumentType === 'string') {
      out.testCaseDocumentType = json.testCaseDocumentType.trim();
    }
    if (typeof json.testRunDocumentType === 'string') {
      out.testRunDocumentType = json.testRunDocumentType.trim();
    }
    return out;
  } catch {
    return {};
  }
}

function readOverride(): Partial<AppConfig> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Partial<AppConfig>) : {};
  } catch {
    return {};
  }
}

/**
 * Highest-precedence overrides from the URL query string, enabling shareable
 * deep links such as `?contract=<id>&network=testnet` or `?demo=1`. Not
 * persisted — the link itself carries the state.
 */
function readUrlParams(): Partial<AppConfig> {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') !== null) {
      return { contractId: 'demo', network: 'testnet' };
    }
    const out: Partial<AppConfig> = {};
    const contract = params.get('contract') ?? params.get('contractId');
    if (contract) out.contractId = contract.trim();
    const network = params.get('network');
    if (network) out.network = asNetwork(network, 'testnet');
    const devnet = params.get('devnet') ?? params.get('devnetName');
    if (devnet) out.devnetName = devnet.trim();
    return out;
  } catch {
    return {};
  }
}

/** Persist the user's in-app overrides (contract id / network). */
export function saveOverride(patch: Partial<AppConfig>): void {
  const merged = { ...readOverride(), ...patch };
  localStorage.setItem(LS_KEY, JSON.stringify(merged));
}

export function clearOverride(): void {
  localStorage.removeItem(LS_KEY);
}

/** Resolve the effective config from all sources (highest precedence last). */
export async function loadConfig(): Promise<AppConfig> {
  const base = envDefaults();
  const runtime = await fetchRuntimeConfig();
  const override = readOverride();
  const url = readUrlParams();
  return { ...base, ...runtime, ...override, ...url };
}

export function isConfigured(config: AppConfig): boolean {
  return config.contractId.trim().length > 0;
}
