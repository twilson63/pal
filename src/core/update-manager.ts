import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  queryLatestPackage,
  downloadPackage,
  verifyHash,
  PackageInfo,
} from "./arweave-client.js";
import {
  loadInstallMetadata,
  saveInstallMetadata,
  InstallMetadata,
  getPackageVersion,
  getTrustedPublisher,
} from "./install-tracker.js";
import { getPalDir } from "./install-tracker.js";

/**
 * Information about an available update.
 */
export interface UpdateInfo {
  currentVersion: string;
  newVersion: string;
  transactionId: string;
  sha256: string;
  publisherAddress: string;
}

/**
 * Current update status.
 */
export interface UpdateStatus {
  isChecking: boolean;
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion?: string;
  error?: string;
}

// Global status for tracking ongoing updates
let currentStatus: UpdateStatus = {
  isChecking: false,
  updateAvailable: false,
  currentVersion: "",
};

const STAGING_DIR = path.join(getPalDir(), "updates", "staging");
const BACKUP_DIR = path.join(getPalDir(), "backups");

/**
 * Ensure staging and backup directories exist.
 */
function ensureDirs(): void {
  if (!fs.existsSync(STAGING_DIR)) {
    fs.mkdirSync(STAGING_DIR, { recursive: true });
  }
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

/**
 * Parse semver string into components.
 *
 * @param version - Semver string (e.g., "1.2.3")
 * @returns Array of [major, minor, patch] or null if invalid
 */
function parseSemver(version: string): [number, number, number] | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

/**
 * Compare two semver versions.
 *
 * @param a - Version A
 * @param b - Version B
 * @returns Negative if a < b, 0 if equal, positive if a > b
 */
function compareVersions(a: string, b: string): number {
  const parsedA = parseSemver(a);
  const parsedB = parseSemver(b);

  if (!parsedA || !parsedB) {
    return 0;
  }

  for (let i = 0; i < 3; i++) {
    const diff = parsedA[i] - parsedB[i];
    if (diff !== 0) return diff;
  }

  return 0;
}

/**
 * Check if version A is strictly newer than version B.
 *
 * @param a - Version A
 * @param b - Version B
 * @returns true if a > b
 */
export function isNewerVersion(a: string, b: string): boolean {
  return compareVersions(a, b) > 0;
}

/**
 * Get the latest package info from Arweave without version comparison.
 * Used for force reinstall of current version.
 *
 * @returns Package info from Arweave, or null if query failed
 */
export async function getLatestPackageInfo(): Promise<UpdateInfo | null> {
  try {
    const metadata = loadInstallMetadata();
    const currentVersion = getPackageVersion() || "0.0.0";

    // Get the trusted publisher address
    const publisherAddress = metadata?.sourceAddress || getTrustedPublisher();
    if (!publisherAddress) {
      throw new Error("No trusted publisher address configured");
    }

    // Query Arweave for latest package
    const packageInfo = await queryLatestPackage(publisherAddress);
    if (!packageInfo) {
      return null;
    }

    return {
      currentVersion,
      newVersion: packageInfo.version,
      transactionId: packageInfo.id,
      sha256: packageInfo.sha256,
      publisherAddress: packageInfo.signerAddress,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to get package info: ${message}`);
    return null;
  }
}

/**
 * Check for available updates from Arweave.
 *
 * @returns Update info if available, null if up to date or error
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  currentStatus.isChecking = true;
  currentStatus.error = undefined;

  try {
    const metadata = loadInstallMetadata();
    const currentVersion = getPackageVersion() || "0.0.0";
    currentStatus.currentVersion = currentVersion;

    // Get the trusted publisher address
    const publisherAddress = metadata?.sourceAddress || getTrustedPublisher();
    if (!publisherAddress) {
      throw new Error("No trusted publisher address configured");
    }

    // Query Arweave for latest package
    const packageInfo = await queryLatestPackage(publisherAddress);
    if (!packageInfo) {
      currentStatus.updateAvailable = false;
      return null;
    }

    // Check if newer
    if (!isNewerVersion(packageInfo.version, currentVersion)) {
      currentStatus.updateAvailable = false;
      if (packageInfo.version === currentVersion) {
        console.log(`Already up to date (${currentVersion})`);
      } else {
        console.log(`Cannot downgrade from ${currentVersion} to ${packageInfo.version}`);
      }
      return null;
    }

    currentStatus.updateAvailable = true;
    currentStatus.latestVersion = packageInfo.version;

    return {
      currentVersion,
      newVersion: packageInfo.version,
      transactionId: packageInfo.id,
      sha256: packageInfo.sha256,
      publisherAddress: packageInfo.signerAddress,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    currentStatus.error = message;
    throw error;
  } finally {
    currentStatus.isChecking = false;
  }
}

/**
 * Download and stage an update.
 *
 * @param update - Update info
 * @param retryCount - Number of retries on hash mismatch
 * @returns Path to staged tarball
 */
async function stageUpdate(
  update: UpdateInfo,
  retryCount = 1
): Promise<string> {
  ensureDirs();

  const tarballPath = path.join(STAGING_DIR, `pal-${update.newVersion}.tgz`);

  // Download package
  console.log(`Downloading update ${update.newVersion}...`);
  const data = await downloadPackage(update.transactionId);

  // Verify hash
  if (!verifyHash(data, update.sha256)) {
    if (retryCount > 0) {
      console.warn("Hash verification failed, retrying...");
      return stageUpdate(update, retryCount - 1);
    }
    throw new Error("Package verification failed: hash mismatch after retry");
  }

  // Save to staging
  fs.writeFileSync(tarballPath, data);
  console.log(`Downloaded to ${tarballPath}`);

  return tarballPath;
}

/**
 * Backup the current installation by creating an npm-pack-compatible tarball.
 * Uses npm pack on the currently installed package directory.
 *
 * @param version - Current version string
 * @param metadata - Install metadata containing install path
 */
function backupCurrentVersion(version: string, metadata: InstallMetadata): void {
  ensureDirs();

  const backupPath = path.join(BACKUP_DIR, `pal-${version}.tgz`);

  // Use npm pack to create a proper npm-installable tarball of current installation
  try {
    console.log(`Backing up current version ${version}...`);

    // Get the package.json directory (project root)
    const currentFilePath = fileURLToPath(import.meta.url);
    const coreDir = path.dirname(currentFilePath);
    const projectRoot = path.resolve(coreDir, "..", "..");

    // Run npm pack to create tarball
    const packOutput = execSync("npm pack", {
      cwd: projectRoot,
      encoding: "utf-8",
    });

    // Parse tarball name from output
    const tarballName = packOutput.trim().split("\n").pop() || "";
    if (!tarballName) {
      throw new Error("Could not determine tarball name from npm pack");
    }

    const tempTarballPath = path.join(projectRoot, tarballName);

    // Move to backup directory with proper name
    fs.renameSync(tempTarballPath, backupPath);
    console.log(`Backed up current version ${version} to ${backupPath}`);
  } catch (error) {
    console.warn(`Warning: Failed to create backup: ${error}`);
    console.warn("Rollback may not be available if update fails");
  }
}

/**
 * Apply an update using the package manager.
 *
 * @param tarballPath - Path to the update tarball
 * @param packageManager - "bun" or "npm"
 */
function applyUpdateWithPm(
  tarballPath: string,
  packageManager: "bun" | "npm"
): void {
  const cmd =
    packageManager === "bun"
      ? `bun install -g "${tarballPath}"`
      : `npm install -g "${tarballPath}"`;

  console.log(`Applying update with ${packageManager}...`);
  execSync(cmd, { stdio: "inherit" });
}

/**
 * Verify the new installation by checking version.
 *
 * @param expectedVersion - Expected version string
 * @returns true if verification passed
 */
function verifyInstallation(expectedVersion: string): boolean {
  try {
    const output = execSync("pal --version", { encoding: "utf-8" });
    return output.includes(expectedVersion);
  } catch {
    return false;
  }
}

/**
 * Apply an update.
 *
 * @param update - Update info
 * @param options - Options for the update
 * @returns true if successful
 */
export async function applyUpdate(
  update: UpdateInfo,
  options: { force?: boolean } = {}
): Promise<boolean> {
  const metadata = loadInstallMetadata();
  if (!metadata) {
    throw new Error("No install metadata found");
  }

  // Verify publisher matches install.json source
  if (update.publisherAddress !== metadata.sourceAddress) {
    throw new Error(
      `Update rejected: signed by different publisher (${update.publisherAddress} != ${metadata.sourceAddress})`
    );
  }

  // Verify publisher matches installed package.json
  const trustedPublisher = getTrustedPublisher();
  if (update.publisherAddress !== trustedPublisher) {
    throw new Error(
      `Update rejected: publisher mismatch with installed package (${update.publisherAddress} != ${trustedPublisher})`
    );
  }

  try {
    // Stage the update
    const tarballPath = await stageUpdate(update);

    // Backup current version before applying update
    backupCurrentVersion(metadata.version, metadata);

    // Store previous version info for rollback
    const previousVersion = metadata.version;
    const previousTxId = metadata.transactionId;

    // Apply update
    applyUpdateWithPm(tarballPath, metadata.packageManager);

    // Verify
    if (!options.force && !verifyInstallation(update.newVersion)) {
      console.error("Update verification failed! Rolling back...");
      await rollbackUpdate();
      return false;
    }

    // Update metadata
    metadata.version = update.newVersion;
    metadata.transactionId = update.transactionId;
    metadata.previousVersion = previousVersion;
    metadata.previousTxId = previousTxId;
    metadata.installedAt = new Date().toISOString();
    saveInstallMetadata(metadata);

    // Cleanup staging
    if (fs.existsSync(tarballPath)) {
      fs.unlinkSync(tarballPath);
    }

    console.log(`Successfully updated to ${update.newVersion}`);
    return true;
  } catch (error) {
    console.error(`Update failed: ${error}`);
    await rollbackUpdate();
    return false;
  }
}

/**
 * Rollback to the previous version.
 *
 * @returns true if successful
 */
export async function rollbackUpdate(): Promise<boolean> {
  const metadata = loadInstallMetadata();
  if (!metadata) {
    throw new Error("No install metadata found");
  }

  const { previousVersion, previousTxId } = metadata;
  if (!previousVersion || !previousTxId) {
    console.error("No previous version to rollback to");
    return false;
  }

  try {
    // Find the backup tarball
    const backupPath = path.join(BACKUP_DIR, `pal-${previousVersion}.tgz`);
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup not found: ${backupPath}`);
    }

    // Apply rollback
    console.log(`Rolling back to ${previousVersion}...`);
    applyUpdateWithPm(backupPath, metadata.packageManager);

    // Restore metadata
    metadata.version = previousVersion;
    metadata.transactionId = previousTxId;
    metadata.previousVersion = undefined;
    metadata.previousTxId = undefined;
    saveInstallMetadata(metadata);

    console.log(`Successfully rolled back to ${previousVersion}`);
    return true;
  } catch (error) {
    console.error(`Rollback failed: ${error}`);
    console.error(
      `Manual fix: ${metadata.packageManager} install -g ~/.pal/backups/${previousVersion}.tgz`
    );
    return false;
  }
}

/**
 * Get current update status.
 *
 * @returns Current status
 */
export function getUpdateStatus(): UpdateStatus {
  return { ...currentStatus };
}

/**
 * Check if update check should be skipped.
 *
 * @param flags - CLI flags
 * @returns true if should skip
 */
export function shouldSkipUpdateCheck(flags?: { skipUpdateCheck?: boolean }): boolean {
  // Check explicit flag
  if (flags?.skipUpdateCheck) return true;

  // Check environment variables
  if (process.env.CI === "true") return true;
  if (process.env.PAL_NO_UPDATE_CHECK === "true") return true;

  return false;
}
