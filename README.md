# Dash Platform QA Dashboard

A **read-only** status dashboard for the on-chain QA framework on Dash Platform.
It reads the `dash-qa` data contract (document types `testCase` and `testRun`),
computes the latest result per test client-side, and renders a tier × category
status matrix, per-test run history, summary counts, and filters.

- **Read-only (v1):** no wallet, no signing, no writes. Queries are
  proof-verified via the [Evo SDK](https://www.npmjs.com/package/@dashevo/evo-sdk)
  (`trusted` mode pre-fetches quorum keys and verifies Platform proofs).
- **Stack:** Vite + React + TypeScript.
- **Data source:** the `dash-qa` contract produced by the sibling
  "on-chain QA data contract + seed from TEST_PLAN" task. The contract ID and
  network are fully configurable (see [Configuration](#configuration)).

> Submitting runs from the browser (which needs wallet signing) is intentionally
> **out of scope for v1**. The seam is stubbed under
> [`src/features/submit-run/`](src/features/submit-run/README.md) so it can be
> added later without touching the read path.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Open the app and either:

- click **Load demo data** (or visit `?demo=1`) to explore with a bundled sample
  dataset — no network needed; or
- open **⚙ Data source**, paste the `dash-qa` **contract id**, pick the
  **network**, and click **Apply & load**.

## Configuration

The dashboard needs a **contract id** and a **network**. There is no single
hard-coded value — resolution runs through these layers, highest precedence
first:

| Precedence | Source | Use case |
|---|---|---|
| 1 | **URL query** — `?contract=<id>&network=testnet`, or `?demo=1` | Shareable deep links (e.g. from TEST_PLAN / a QA issue). |
| 2 | **In-app settings** (⚙ Data source) → `localStorage` | A person trying it locally. |
| 3 | **`public/config.json`** (fetched at runtime) | A fixed deploy you can re-point without rebuilding. |
| 4 | **Build-time env** — `VITE_CONTRACT_ID`, `VITE_NETWORK` | Baking the contract into the bundle / CI. |
| 5 | Defaults (`network: testnet`, contract empty) | — |

### Where to get the contract id

The sibling contract task writes `contract-id.<network>.json` (e.g.
`contract-id.testnet.json`) when it registers the contract:

```json
{ "network": "testnet", "contractId": "<base58 contract id>", "...": "..." }
```

Copy that `contractId` into whichever layer fits:

- **Local:** paste it into ⚙ Data source, or copy `.env.example` → `.env` and set
  `VITE_CONTRACT_ID`.
- **Fixed deploy without rebuild:** copy `public/config.example.json` →
  `public/config.json` and set `contractId` (this file is gitignored by default;
  commit it if you want it version-controlled).
- **CI / GitHub Pages:** set the `CONTRACT_ID` (and optional `NETWORK`)
  repository **variables** — the deploy workflow passes them as `VITE_*`.

> Testnet resets periodically, so the contract id changes when it is
> re-registered. Re-point the dashboard via any layer above; no code change
> needed.

### Deep links

- `?demo=1` — load the bundled demo dataset.
- `?contract=<base58>&network=testnet` — point at a specific contract.
- `?test=CORE-05` — open that test's run-history drawer on load.

## Expected contract schema

The dashboard reads these `dash-qa` document types (field names mirror the
sibling task's `schema/qa-contract.documents.json`). The normaliser
([`src/sdk/normalize.ts`](src/sdk/normalize.ts)) is tolerant of synonyms and of
the TEST_PLAN emoji vocabulary, so minor drift degrades gracefully.

The contract is **normalised** (v3+): `tier`, `category`, and `app` are separate
lookup document types (`{ code, name }`), and `testCase` / `testRun` reference
them by integer `code`. The dashboard fetches those lookups up front and
resolves the codes back to names (so the matrix/filters show `Essential` /
`Core`, not `0` / `0`); unresolved or string-typed values pass through, so older
contracts still work.

**Lookups** — `tier` / `category` / `app`, each `{ code (int), name }`
(`app` also carries `platform`, `description`).

**`testCase`** — one row of the TEST_PLAN §4 catalog:
`testId` (e.g. `CORE-05`), `app`/`tier`/`category` (integer FK codes → resolved
names), `title`, `layer`, `implStatus` (the glyph ✅/🧪/⚠️/🔌/🚫),
`description`, `entryPoint`, `prerequisites`, `planCommit`.

**`testRun`** — an append-only execution record:
`testId`, `app` (FK code → name), `result` (enum `pass`/`fail`/`blocked`/`skipped`),
`network` (integer id — `0`=mainnet, `1`=testnet, `2`=devnet, `3`=regtest —
mapped to a name), `buildRef`, `device`, `evidence` (txid / URL / path —
classified for display), `notes`, `blockerReason`. `$createdAt` is the run time.
The unique `(testId, app)` index allows per-app results; with a single seeded
app today the dashboard keys "latest result" by `testId`.

### How "latest result" is computed

Platform has no `GROUP BY`, so the reduction is client-side: fetch all
`testRun` docs (paginated), sort by `$createdAt` desc, then take the first run
per `testId`. The contract indexes `$createdAt` only inside `$ownerId`-prefixed
composite indices (e.g. `[$ownerId,testId,$createdAt]`), so a global "order all
runs by time" query isn't possible — paging through every run and sorting in the
client is both index-safe and complete for an append-only audit log of this size.
Runs are loaded up to a cap (`DEFAULT_MAX_DOCS`, 5000); if exceeded, only the
oldest beyond the cap are dropped.

## Scripts

```bash
npm run dev        # dev server (serves from / locally)
npm run build      # typecheck + production build to dist/
npm run preview    # serve the production build locally
npm test           # unit tests (vitest) — normalise + aggregation logic
npm run typecheck  # tsc, no emit
```

## Deployment (GitHub Pages)

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs on push to
`main`: it typechecks, tests, builds, and publishes `dist/` to GitHub Pages.

The production build uses base path `/qa-dashboard-site/` (the repo name) to
match `https://<org>.github.io/qa-dashboard-site/`. For a custom domain or
Vercel, set `VITE_BASE=/` at build time.

One-time setup: in the repo settings, enable **Pages → Build and deployment →
Source: GitHub Actions**. Optionally set the `CONTRACT_ID` repository variable
to bake the live contract into the deployed bundle.

## Project structure

```
src/
  config.ts              # contract id + network resolution (URL/LS/json/env)
  sdk/
    client.ts            # Evo SDK connection (trusted, memoised per network)
    documents.ts         # fetch testCase / testRun (+ demo short-circuit)
    normalize.ts         # raw Platform docs → typed model (tolerant)
    types.ts             # domain model + enums + ordering
  data/
    compute.ts           # latest-per-test, matrix, summary, filters (pure)
    useQaData.ts         # React hook: load + reload
    demo.ts              # bundled demo dataset (?demo=1)
  components/            # SummaryCounts, StatusMatrix, Filters, TestList, RunHistory, …
  features/submit-run/   # future write feature — stub only, never imported by reads
```

## License

MIT
