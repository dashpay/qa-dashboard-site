// Placeholder for the future, write-enabled "submit a run" feature.
//
// Intentionally NOT implemented in v1 (read-only). This module exists to mark
// the seam: the read path under src/sdk/ must never import from here, and
// adding signing later should be purely additive. See ./README.md.

import type { RunResult } from '../../sdk/types';

export interface SubmitRunInput {
  testId: string;
  result: RunResult;
  network: string;
  buildRef: string;
  notes?: string;
  evidenceUrl?: string;
  txid?: string;
}

/** A signer abstraction a future implementation would depend on. */
export interface RunSigner {
  identityId: string;
  // e.g. privateKeyWif / hardware handle / extension provider — TBD.
}

export async function submitRun(_input: SubmitRunInput, _signer: RunSigner): Promise<never> {
  throw new Error(
    'submitRun() is not implemented: this dashboard is read-only in v1. ' +
      'See src/features/submit-run/README.md.',
  );
}
