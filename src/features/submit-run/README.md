# Future feature: submit a test run (out of scope for v1)

v1 of this dashboard is **strictly read-only** — it never signs or broadcasts a
state transition, so it needs no wallet, identity, or private key.

A future "submit a run" feature would let an authenticated user (or a CI agent)
create a `testRun` document on-chain directly from the dashboard. That requires
capabilities deliberately kept **out** of the read path:

- A wallet / key source (mnemonic, hardware, or browser-extension signer).
- An identity with a credit balance and a key of the right purpose/security
  level to author documents under the dash-qa contract.
- The Evo SDK **write** APIs: `sdk.documents.create(...)` plus
  `sdk.stateTransitions.*` to broadcast and await confirmation.

## Why it's isolated here

All read code lives in `src/sdk/` and never imports anything from this folder.
Keeping the write path in its own feature folder means adding it later is purely
additive: wire a signer, implement `submitRun()` below, and mount a form — with
no change to the read-only data flow.

See [`index.ts`](./index.ts) for the typed stub.
