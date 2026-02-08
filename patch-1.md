# Patch Plan: Arweave Distribution Fixes

## Overview

This patch addresses functional gaps and spec mismatches in the Arweave-based distribution feature implementation. The implementation compiles and basic tests pass, but several critical issues prevent production use.

## Issues Summary

### Critical (Must Fix)

1. **Backup/Rollback Non-Functional** (`src/core/update-manager.ts:206`)
   - `backupCurrentVersion()` is a stub that only logs
   - Rollback depends on tarball existing at `~/.pal/backups/<version>.tgz`
   - **Impact**: Rollback will always fail, leaving broken installs

2. **Force Reinstall Broken** (`src/cli/commands/update.ts:43`)
   - `--force` calls `checkForUpdate()` which returns null when up-to-date
   - Cannot reinstall current version as intended
   - **Impact**: User cannot force-reinstall to recover from corruption

3. **Trust Model Incomplete** (`src/core/update-manager.ts:124`)
   - Doesn't cross-check `install.json` `sourceAddress` with installed `package.json` `pal.publisher`
   - **Impact**: User could edit `install.json` to bypass publisher verification

### Medium Priority

4. **Startup Timeout Ineffective** (`src/cli/index.ts:26`)
   - Timeout is created but never properly races/cancels the update check
   - **Impact**: Startup can block beyond 5 seconds

5. **Semver Validation Not Strict** (`src/core/arweave-client.ts:120`)
   - Pattern `/^\d+\.\d+\.\d+/` allows suffixes (e.g., "1.2.3-beta")
   - Plan requires "strict MAJOR.MINOR.PATCH"
   - **Impact**: Prerelease versions could slip through

6. **`lastUpdateCheck` Not Updated on All Paths** (`src/cli/index.ts:32-33`)
   - Only updated on successful `checkForUpdate()`, not on timeout/error/user-decline
   - **Impact**: Update check may run repeatedly if user declines or check fails

### Low Priority

7. **Timeout Message Mismatch** (`src/core/arweave-client.ts:138`)
   - Error says "5 seconds" but constant is 10000ms (10s)

8. **Unnecessary Side Effects** (`src/cli/index.ts:58`)
   - `initInstallMetadata()` runs on every CLI invocation
   - Should only run for commands that need it

9. **Missing Test Files** (4 required test suites)
   - `src/core/arweave-client.test.ts`
   - `src/core/update-manager.test.ts`
   - `src/cli/commands/version.test.ts`
   - `src/cli/commands/update.test.ts`

10. **Missing `.env.example`**
    - Plan requires documenting Arweave wallet configuration

### Additional Gaps (Not in Original Plan)

11. **Backup Format Risk** (`src/core/update-manager.ts`)
    - Rollback uses `bun/npm install -g <tgz>`, requiring npm-pack-compatible tarball
    - Raw tar of install directory may not be installable
    - **Impact**: Rollback may fail due to incompatible tarball format

12. **Publish Script Not Type-Checked** (`scripts/publish.ts`)
    - Outside `tsconfig.json` scope (`src/**/*` only)
    - **Impact**: Type errors in publish script go undetected

13. **Lockfiles Not Updated** (`package-lock.json`, `bun.lock`)
    - `package.json` changed with new devDeps (`arweave`, `tsx`)
    - Lockfiles may be stale or inconsistent
    - **Impact**: Dependency resolution issues or reproducibility problems

14. **Weak Install-Tracker Tests** (`src/core/install-tracker.test.ts`)
    - Tests ad-hoc local fs/date logic rather than module behavior
    - Doesn't actually test the module's file path handling
    - **Impact**: Low test coverage for core installation tracking

## Patch Implementation Order

### Phase 1: Critical Fixes (Required for Production)

#### Fix 1: Implement Real Backup in `backupCurrentVersion()`
**File**: `src/core/update-manager.ts`  
**Lines**: 201-213

**Current**:
```typescript
function backupCurrentVersion(version: string): void {
  ensureDirs();
  console.log(`Backing up current version ${version}...`);
}
```

**Required**: 
- Create npm-pack-compatible tarball at `~/.pal/backups/<version>.tgz`
- Must be installable via `bun/npm install -g <tarball>`
- Use `npm pack` approach or tar with correct structure

**Implementation Approach**:
- Option A: Save the downloaded/staged tarball as backup before applying
- Option B: Use `npm pack` on the installed package directory
- Ensure tarball structure matches npm-pack output

---

#### Fix 2: Fix `--force` to Reinstall Current Version
**File**: `src/cli/commands/update.ts`  
**Lines**: 43-56

**Current**:
```typescript
if (options.force) {
  const update = await checkForUpdate();
  if (!update) {
    // Fails here because checkForUpdate returns null when up-to-date
    process.exit(1);
  }
  ...
}
```

**Required**: `--force` should:
1. Query Arweave for the current version (even if same as installed)
2. Download and reinstall it
3. Skip version comparison when `force: true`

**Implementation Approach**:
- Modify `applyUpdate()` to accept `force` option and skip verification
- Query Arweave even when `isNewerVersion()` would return false
- Or use existing backup tarball if available

---

#### Fix 3: Strengthen Trust Model
**File**: `src/core/update-manager.ts`  
**Lines**: 256-270

**Current**:
```typescript
// Only checks update.publisherAddress against metadata.sourceAddress
if (update.publisherAddress !== metadata.sourceAddress) {
  throw new Error(...)
}
```

**Required**: Also verify against installed `package.json` `pal.publisher`:
```typescript
const installedPublisher = getTrustedPublisher();
if (update.publisherAddress !== metadata.sourceAddress || 
    update.publisherAddress !== installedPublisher) {
  throw new Error("Update rejected: publisher mismatch");
}
```

---

### Phase 2: Reliability Improvements

#### Fix 4: Fix Startup Timeout
**File**: `src/cli/index.ts`  
**Lines**: 17-55

**Current**: Timeout is created but doesn't actually cancel the operation

**Required**: 
- Use `Promise.race()` to enforce 5-second hard cap
- Must cover entire path: check + prompt + apply
- Continue normally after timeout regardless of state

**Implementation**:
```typescript
const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error('timeout')), 5000);
});

try {
  await Promise.race([startupUpdateCheck(), timeoutPromise]);
} catch {
  // Timeout or error - continue normally
}
```

---

#### Fix 5: Strict Semver Validation
**File**: `src/core/arweave-client.ts`  
**Lines**: 119-123

**Current**: `/^\d+\.\d+\.\d+/`

**Required**: Strict MAJOR.MINOR.PATCH only:
```typescript
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.warn(`Skipping transaction ${node.id}: invalid semver "${version}"`);
  continue;
}
```

---

#### Fix 6: Update `lastUpdateCheck` on All Paths
**File**: `src/cli/index.ts`  
**Lines**: 31-54

**Current**: Only updated on successful `checkForUpdate()` path

**Required**: Update timestamp after every attempt (success, no-update, timeout, error, user-decline)

**Implementation**:
```typescript
recordUpdateCheck(); // Move to finally block or call in all branches
```

---

#### Fix 7: Fix Timeout Error Message
**File**: `src/core/arweave-client.ts`  
**Lines**: 137-138

**Current**: "GraphQL query timed out after 5 seconds"
**Required**: "GraphQL query timed out after 10 seconds" (or change constant to 5000ms)

---

### Phase 3: Code Quality & Documentation

#### Fix 8: Move `initInstallMetadata()` to Lazy Initialization
**File**: `src/cli/index.ts`  
**Lines**: 57-58

**Current**: Runs on every CLI start
**Required**: Move into `startupUpdateCheck()` or commands that need it

---

#### Fix 9: Type-Check Publish Script
**File**: `tsconfig.json` or add check script

**Options**:
1. Add `scripts/**/*` to `tsconfig.json` include
2. Create separate `tsconfig.scripts.json` for scripts
3. Add `tsx --noEmit scripts/publish.ts` to validate

---

#### Fix 10: Update Lockfiles
**Files**: `package-lock.json`, `bun.lock`

**Required**:
- Run `npm install` to update `package-lock.json`
- Run `bun install` to update `bun.lock`
- Verify lockfiles are committed

---

#### Fix 11: Create Required Test Files

**Files to Create**:
1. `src/core/arweave-client.test.ts` - Mock fetch for GraphQL, download, hash verification
2. `src/core/update-manager.test.ts` - Full state machine with mocked dependencies
3. `src/cli/commands/version.test.ts` - CLI output formatting
4. `src/cli/commands/update.test.ts` - CLI command behavior

---

#### Fix 12: Rewrite `install-tracker.test.ts`
**File**: `src/core/install-tracker.test.ts`

**Current**: Tests ad-hoc logic, not module behavior
**Required**: Test actual module functions against temp `~/.pal` directories

---

#### Fix 13: Create `.env.example`
**File**: `.env.example`

**Content**:
```bash
# Arweave Publisher Configuration
# Place your wallet JWK file at ~/.arweave/pal-publisher.json

# Optional: Custom Arweave gateway (default: https://arweave.net)
# ARWEAVE_GATEWAY=https://arweave.net

# Optional: Skip update checks
# PAL_NO_UPDATE_CHECK=true
```

---

## Success Criteria After Patch

### Critical Fixes Verify
- [ ] Backup creates actual tarball at `~/.pal/backups/<version>.tgz`
- [ ] Rollback successfully restores from backup
- [ ] `--force` flag reinstalls current version
- [ ] Editing `install.json` `sourceAddress` fails update (cross-checked with `package.json`)

### Reliability Verify
- [ ] Startup never blocked >5 seconds by update check
- [ ] Strict semver rejects "1.2.3-beta" but accepts "1.2.3"
- [ ] Timeout messages match actual timeout values
- [ ] `lastUpdateCheck` updated after every startup attempt (success, decline, error, timeout)

### Testing Verify
- [ ] `bun test src/core/arweave-client.test.ts` passes with mocked fetch
- [ ] `bun test src/core/update-manager.test.ts` passes with mocked deps
- [ ] All 4 new test files exist and pass
- [ ] `install-tracker.test.ts` validates real module behavior against temp paths

### Documentation Verify
- [ ] `.env.example` exists with Arweave config documentation

### Additional Gaps Verify
- [ ] Backup tarball is npm-installable (`bun/npm install -g <backup.tgz>` succeeds)
- [ ] `scripts/publish.ts` passes type check (included in tsconfig or separate check)
- [ ] Lockfiles updated and consistent with `package.json`
- [ ] `pal update --force` reinstalls even when already on latest version
- [ ] Tampering test: editing `~/.pal/install.json` causes rejection when mismatched
- [ ] Startup timeout covers entire check+prompt+apply path, not just network

## Implementation Notes

### Testing Strategy
- Use `bun:test` with `mock()` for fetch/child_process
- Create temp directories for file operations
- Mock Arweave responses with realistic GraphQL structure
- Test backup format by actually installing the tarball in tests

### Backward Compatibility
- All fixes are additive or bug fixes
- No breaking changes to existing CLI behavior
- New flags are optional

### Dependencies
- No new runtime dependencies needed
- Tests use existing `bun:test`
- Dev dependency `arweave` already added for publish script

### Verification Commands
```bash
# Type checking
npm run typecheck

# Tests
npm test
bun test src/core/arweave-client.test.ts
bun test src/core/update-manager.test.ts

# Publish script type check
tsx --noEmit scripts/publish.ts

# Lockfile updates
npm install
bun install
```
