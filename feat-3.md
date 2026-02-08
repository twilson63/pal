# Feature Plan: Arweave-Based Distribution & Auto-Update

## Overview

Implement a decentralized package distribution system using Arweave as the package repository. PAL will be installable directly from Arweave, with automatic updates verified cryptographically. The system stores the publisher's wallet address in `package.json` and only accepts updates signed by that same address, creating a secure, self-sovereign package manager.

## Key Principles

- Source of truth is Arweave (permanent, immutable storage)
- Cryptographic verification via embedded wallet address in package
- No dependency on npm registry or centralized infrastructure
- Automatic updates with user consent
- Rollback capability for failed updates

## Product Decisions (Locked)

### Distribution Model

- Package is an **npm-pack compatible tarball** (produced by `npm pack`)
- Contains `package.json`, `dist/`, `README.md`, `LICENSE`
- Transaction tagged with `App-Name: pal`, `Version: x.y.z`, `Type: package`, `Signer-Address: <wallet>`, `SHA-256: <hash>`
- Installable via `bun install -g https://arweave.net/<tx-id>` or `npm install -g https://arweave.net/<tx-id>`
- No npm registry dependency

### Security Model

- Publisher wallet address stored in `package.json` `pal.publisher` field
- CLI stores installation source address in `~/.pal/install.json`
- Updates only accepted from same wallet address as original install
- Version must be strictly newer (semver comparison)
- SHA256 hash verification of downloaded packages

### Update Behavior

- Check for updates on startup (if > 7 days since last check)
- Interactive prompt: "Update available: X → Y. Update now? [Y/n]"
- `--skip-update-check` flag to bypass
- `pal update` command for manual checks
- `pal update --check` to check without applying
- `pal update --force` to reinstall current version
- Automatic rollback on failed update

### Versioning

- Strict semantic versioning (MAJOR.MINOR.PATCH)
- Version read from `package.json` at runtime
- No prerelease/beta channels in v1

## Architecture

### 1. Arweave Transaction Format

```typescript
interface PackageTransaction {
  id: string;                    // Arweave transaction ID
  tags: {
    "App-Name": "pal";
    "Version": string;           // e.g., "0.1.0"
    "Type": "package";
    "Signer-Address": string;    // Arweave wallet address
    "Content-Type": "application/gzip";
    "SHA-256": string;           // Hash of tarball
  };
  data: Uint8Array;              // Gzipped tarball
  timestamp: number;             // Block timestamp
}
```

### 2. Publish Script (`scripts/publish.ts`)

**Responsibilities:**
- Run `tsc` (TypeScript compilation)
- Set `pal.publisher` and `pal.buildTimestamp` fields in `package.json`
- Run `npm pack` to create tarball
- Calculate SHA256 hash of tarball
- Upload to Arweave with proper tags (using `arweave` package)
- Restore original `package.json` after packing
- Output transaction ID

**Upload Requirements:**
- Arweave wallet (JWK file at `~/.arweave/pal-publisher.json`)
- Sufficient AR balance for storage
- Network: mainnet for production

### 3. Installation Tracking (`src/core/install-tracker.ts`)

**Storage:** `~/.pal/install.json`

```typescript
interface InstallMetadata {
  version: string;               // Installed version
  sourceAddress: string;         // Arweave wallet that published
  transactionId: string;         // Arweave TX ID of install
  installedAt: string;           // ISO timestamp
  installPath: string;           // Where PAL is installed
  lastUpdateCheck: string;       // ISO timestamp
  packageManager: "bun" | "npm"; // Package manager used for install
  previousVersion?: string;      // For rollback
  previousTxId?: string;         // For rollback
}
```

**API:**
- `loadInstallMetadata(): InstallMetadata | null`
- `saveInstallMetadata(metadata: InstallMetadata): void`
- `getTrustedPublisher(): string | null` - Returns address from installed `package.json` `pal.publisher`
- `detectPackageManager(): "bun" | "npm"` - Detects which PM was used for current install

**First-Run Behavior:**
- On startup, if `install.json` doesn't exist, read `pal.publisher` from own `package.json`
- Read `version` from `package.json`
- Detect package manager used for install
- Auto-create `install.json` with detected values
- For initial install from Arweave, `transactionId` may be empty (user can manually set or we skip it)

### 4. Arweave Client (`src/core/arweave-client.ts`)

**Responsibilities:**
- Query Arweave GraphQL for package transactions
- Download package data via raw HTTP
- Verify SHA256 hashes
- No `arweave` package dependency at runtime (uses `fetch`)

**Implementation:**
- GraphQL queries via `POST https://arweave.net/graphql` (or configurable gateway)
- Downloads via `GET https://arweave.net/<tx-id>`
- Network timeouts: 10s for GraphQL, 60s for downloads
- Retry logic: 3 attempts with exponential backoff

**GraphQL Query:**

```graphql
query GetLatestPackage($address: String!, $appName: String!) {
  transactions(
    owners: [$address]
    tags: [
      { name: "App-Name", values: [$appName] }
      { name: "Type", values: ["package"] }
    ]
    sort: HEIGHT_DESC
    first: 10
  ) {
    edges {
      node {
        id
        tags {
          name
          value
        }
        block {
          timestamp
        }
      }
    }
  }
}
```

**API:**
- `queryLatestPackage(publisherAddress: string): Promise<PackageInfo | null>`
- `downloadPackage(transactionId: string): Promise<Buffer>`
- `verifyHash(data: Buffer, expectedHash: string): boolean`

### 5. Update Manager (`src/core/update-manager.ts`)

**Responsibilities:**
- Check for available updates
- Download and verify new versions
- Apply updates using `bun/npm install -g <tarball>`
- Rollback capability using backed-up tarball
- Handle update errors

**Update Flow:**
1. Load install metadata (get trusted publisher address)
2. Query Arweave for latest package from that address
3. Compare versions (semver)
4. If newer: download to `~/.pal/updates/staging/`, verify hash
5. Backup current version: copy tarball to `~/.pal/backups/<version>.tgz`
6. Apply update: run `bun install -g <staging-tarball>` (or npm equivalent)
7. Verify new installation: run `pal --version`, check it matches expected
8. If failed: rollback via `bun install -g <backup-tarball>`
9. Update `install.json` with new version, new TX ID, previous version info

**Rollback Flow:**
1. Check if backup tarball exists in `~/.pal/backups/`
2. Run `bun install -g <backup-tarball>` (or npm equivalent)
3. Restore `install.json` from `previousVersion`/`previousTxId` fields
4. If rollback fails: show manual recovery instructions

**API:**
- `checkForUpdate(): Promise<UpdateInfo | null>`
- `applyUpdate(update: UpdateInfo): Promise<boolean>`
- `rollbackUpdate(): Promise<boolean>`
- `getUpdateStatus(): UpdateStatus`

**Staging Directory:** `~/.pal/updates/staging/`
**Backup Directory:** `~/.pal/backups/<version>.tgz`

### 6. CLI Commands

**New Commands:**
- `pal update` - Check and apply update
- `pal update --check` - Check only, don't apply
- `pal update --force` - Force reinstall current version
- `pal version` - Show version, install source, last check

**Modified Commands:**
- `pal` (default / `pal run`) - Check for updates on startup (if due)

**Update Check Schedule:**
- Check if `Date.now() - lastUpdateCheck > 7 days`
- Skip if `--skip-update-check` flag present
- Skip if `CI=true` environment variable set
- Skip if `PAL_NO_UPDATE_CHECK=true` environment variable set
- Timeout after 5 seconds and continue normally

### 7. Package Integration

**package.json Fields:**

```json
{
  "pal": {
    "publisher": "<arweave-wallet-address>",
    "buildTimestamp": "2024-01-15T10:30:00Z"
  }
}
```

**Publish Script:**

```bash
npm run publish:arweave
# 1. Runs TypeScript build
# 2. Sets pal.publisher and pal.buildTimestamp in package.json
# 3. Runs npm pack to create tarball
# 4. Uploads tarball to Arweave
# 5. Restores original package.json
# 6. Outputs TX ID
```

**GraphQL Gateway:**
- Default: `https://arweave.net/graphql`
- Configurable via `ARWEAVE_GATEWAY` env var
- Support for Turbo/Goldsky gateways

## Storage Layout

### Arweave

- Package transactions with immutable tags
- No external metadata service needed
- GraphQL queries for discovery

### Local Files

```
~/.pal/
  config.json           # Existing config
  install.json          # Install metadata (new)
  updates/
    staging/            # Downloaded tarballs (temp)
  backups/
    0.1.0.tgz           # Previous version backup
    0.2.0.tgz
  crons.json            # Existing cron jobs
  logs/                 # Existing logs
```

## Error Handling

### Arweave Errors

- Network timeout: Retry 3x with exponential backoff
- No transactions found: "No updates available"
- Invalid hash: "Package verification failed, retrying..."
- GraphQL error: "Cannot reach Arweave, skipping update check"
- GraphQL timeout (5s): Skip check, continue normal operation

### Update Errors

- Download failed: Keep current version, notify user
- Hash mismatch: Discard download, retry once, then abort
- Apply failed: Rollback to backup automatically
- Rollback failed: "Manual intervention required" + instructions: `bun install -g ~/.pal/backups/<version>.tgz`

### Version Errors

- Invalid semver in tag: Skip that transaction, log warning
- Downgrade attempt: "Cannot downgrade, use --force to reinstall"
- Same version: "Already up to date"

## Security Considerations

### Trust Model

- Publisher address is the root of trust (stored in `package.json` `pal.publisher`)
- Once installed, only that address can provide updates
- Users can reinstall from different address (breaks chain, requires manual reinstall)
- No centralized certificate authority needed

### Attack Vectors

- **Impersonation:** Mitigated by wallet signature verification via Arweave
- **Replay:** Each version has unique TX ID, timestamp checked
- **Downgrade:** Version comparison prevents older versions
- **Tampering:** SHA256 hash verification of package content
- **MITM:** Arweave's blockchain provides immutable storage

### Edge Cases

- Publisher loses wallet: Users stuck on last version, must reinstall
- Malicious update: Publisher compromise affects all users
- Network partition: Updates deferred until connectivity restored
- Storage cost: Publisher must fund Arweave storage

## Files to Create/Modify

1. `scripts/publish.ts` - Build script with Arweave upload
2. `src/core/arweave-client.ts` - Arweave GraphQL client (fetch-based)
3. `src/core/install-tracker.ts` - Installation metadata management
4. `src/core/update-manager.ts` - Update logic
5. `src/cli/commands/update.ts` - Update CLI command
6. `src/cli/commands/version.ts` - Enhanced version command
7. `src/cli/index.ts` - Add update commands, startup check hook
8. `src/cli/prompts.ts` - Add update confirmation prompt
9. `package.json` - Add `pal` field, `publish:arweave` script, `arweave` devDep
10. `.env.example` - Add Arweave wallet configuration

## Success Criteria

This feature is complete when all of the following are true:

### 1. Publish Pipeline Works

- [ ] `npm run publish:arweave` runs `tsc`, sets `pal.publisher` + `pal.buildTimestamp` in `package.json`, runs `npm pack`, uploads tarball to Arweave
- [ ] Transaction ID is printed to stdout on success
- [ ] Arweave transaction has correct tags: `App-Name: pal`, `Version: <semver>`, `Type: package`, `Signer-Address: <wallet>`, `Content-Type: application/gzip`, `SHA-256: <hash>`
- [ ] `package.json` is restored to its original state after publish (no leftover mutations)
- [ ] Script fails gracefully with clear error if wallet file missing, insufficient AR balance, or network unavailable

### 2. Install from Arweave Works

- [ ] `bun install -g https://arweave.net/<tx-id>` successfully installs PAL and the `pal` binary is available on PATH
- [ ] `npm install -g https://arweave.net/<tx-id>` also works as an alternative
- [ ] On first run after install, `~/.pal/install.json` is auto-created with: `version`, `sourceAddress` (from `package.json` `pal.publisher`), `installedAt`, `installPath`, `lastUpdateCheck`, `packageManager` (detected)
- [ ] `pal version` shows version, publisher address, install date, and last update check

### 3. Update Detection Works

- [ ] `pal update --check` queries Arweave GraphQL for latest package from the trusted publisher
- [ ] Reports "Update available: 0.1.0 -> 0.2.0" when a newer version exists
- [ ] Reports "Already up to date (0.1.0)" when no newer version exists
- [ ] Only considers transactions signed by the address in `install.json` `sourceAddress`
- [ ] Skips transactions with invalid semver in their Version tag (logs warning)
- [ ] Handles network errors gracefully: "Cannot reach Arweave gateway, skipping update check"

### 4. Update Application Works

- [ ] `pal update` downloads the new tarball to `~/.pal/updates/staging/`
- [ ] SHA256 hash of downloaded tarball is verified against the `SHA-256` tag on the transaction
- [ ] Current version is backed up to `~/.pal/backups/<version>.tgz` before applying
- [ ] Update is applied via `bun install -g <tarball>` (or `npm install -g` matching original install method)
- [ ] After install, `pal --version` is invoked to verify the new version is running
- [ ] `install.json` is updated with new version, new TX ID, and `previousVersion`/`previousTxId` fields
- [ ] On verification failure: automatic rollback via `bun install -g ~/.pal/backups/<old>.tgz`
- [ ] On hash mismatch: download is discarded, retry once, then abort with error message
- [ ] `pal update --force` reinstalls the current version (re-downloads and re-applies)

### 5. Rollback Works

- [ ] If update verification fails (new `pal --version` doesn't match expected), rollback triggers automatically
- [ ] Rollback restores the previous version from `~/.pal/backups/`
- [ ] `install.json` is reverted to previous version info
- [ ] If rollback itself fails, user gets a clear message: "Rollback failed. Manual fix: `bun install -g ~/.pal/backups/<version>.tgz`"

### 6. Auto-Check on Startup Works

- [ ] When `pal run` is invoked and `lastUpdateCheck` is older than 7 days, an update check runs
- [ ] If update available, user sees: "Update available: X -> Y. Update now? [Y/n]"
- [ ] Answering Y applies the update (same flow as `pal update`)
- [ ] Answering N skips and continues to normal operation
- [ ] `lastUpdateCheck` timestamp is updated regardless of whether an update was found
- [ ] Check is skipped when `--skip-update-check` flag is present
- [ ] Check is skipped when `CI=true` environment variable is set
- [ ] Check is skipped when `PAL_NO_UPDATE_CHECK=true` environment variable is set
- [ ] Check does not block startup for more than 5 seconds (timeout + continue)

### 7. Security Requirements Met

- [ ] Updates are only accepted from the wallet address matching `install.json` `sourceAddress`
- [ ] A package signed by a different wallet address is rejected with clear error
- [ ] Downgrade attempts (older semver) are rejected: "Cannot downgrade from X to Y"
- [ ] SHA256 hash mismatch causes download rejection
- [ ] `install.json` cannot be edited to change `sourceAddress` and have updates still work (address is cross-checked with `package.json` `pal.publisher` of the installed version)

### 8. Arweave Client is Robust

- [ ] Uses raw `fetch()` -- no `arweave` package dependency at runtime
- [ ] Gateway URL is configurable via `ARWEAVE_GATEWAY` env var (default: `https://arweave.net`)
- [ ] Network timeouts: 10s for GraphQL queries, 60s for tarball downloads
- [ ] Retries: 3 attempts with exponential backoff on transient failures
- [ ] GraphQL response parsing handles edge cases (empty results, malformed tags)

### 9. Tests Pass

- [ ] `arweave-client.test.ts`: Mocked fetch for GraphQL queries and downloads, hash verification
- [ ] `install-tracker.test.ts`: CRUD on `install.json` in temp directories
- [ ] `update-manager.test.ts`: Full state machine (check -> download -> verify -> backup -> install -> verify -> cleanup), mocked child process and arweave client
- [ ] `version.test.ts` and `update.test.ts`: CLI command output formatting
- [ ] All existing tests continue to pass (`bun test`)
- [ ] `npm run typecheck` passes with no errors

### 10. No Regression

- [ ] `pal run`, `pal init`, `pal config`, `pal cron` all work exactly as before
- [ ] No new runtime dependencies added (arweave package is devDependency only)
- [ ] Startup time is not measurably impacted when no update check is due

## Out of Scope (v1)

- Windows Task Scheduler support (cron feature)
- Prerelease/beta channels
- Delta/binary diff updates (full tarball only)
- Peer-to-peer update sharing
- Multiple publisher trust (quorum/multisig)
- Package signing with external signatures
- Update encryption/privacy
- Paid updates/micropayments

## Future Enhancements (v2+)

- Beta channel support (tag: `Channel: beta`)
- Delta updates (only changed files)
- Multi-sig publisher support
- Update verification via social proof
- Install verification for users
- Package browser/discovery UI
- Update scheduling (defer, auto-apply)

## Testing Plan

- Unit tests: Version comparison, hash verification (mocked crypto)
- Unit tests: Arweave GraphQL query parsing (mocked fetch responses)
- Unit tests: Install tracker CRUD (temp directories, cleanup with `afterEach`)
- Unit tests: Update manager state machine (mocked arweave-client, mocked `child_process.execSync` for package manager calls)
- Integration test: Mock Arweave HTTP server serving tarball, full update flow
- Manual test: Full update cycle on testnet
- Manual test: Rollback scenario (force a broken update, verify rollback works)
- Manual test: Skip flags respected (`--skip-update-check`, `CI=true`, `PAL_NO_UPDATE_CHECK=true`)

## Notes

### Arweave Costs

- ~90KB tarball = ~0.0005 AR (~$0.0001 USD at current rates)
- 100 releases = ~$0.01 USD
- Negligible cost for open source project

### Alternative: Bundlr/Irys

- Can use Bundlr for faster uploads if needed
- Same transaction format, different upload method
- Falls back to direct Arweave if preferred

### GraphQL Gateway

- Default: `https://arweave.net/graphql`
- Configurable via `ARWEAVE_GATEWAY` env var
- Support for Turbo/Goldsky gateways

## Dependencies to Add

```json
{
  "devDependencies": {
    "arweave": "^1.14.0"
  }
}
```

**Note:** The `arweave` package is used **only in the publish script** for uploading. The CLI runtime uses raw `fetch()` calls to the Arweave gateway.
