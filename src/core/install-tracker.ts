import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

/**
 * Installation metadata structure.
 */
export interface InstallMetadata {
  version: string;
  sourceAddress: string;
  transactionId: string;
  installedAt: string;
  installPath: string;
  lastUpdateCheck: string;
  packageManager: "bun" | "npm";
  previousVersion?: string;
  previousTxId?: string;
}

const PAL_DIR_NAME = ".pal";
const INSTALL_FILE = "install.json";

/**
 * Get the PAL configuration directory path.
 *
 * @returns Path to ~/.pal
 */
export function getPalDir(): string {
  return path.join(homedir(), PAL_DIR_NAME);
}

/**
 * Get the path to install.json.
 *
 * @returns Path to ~/.pal/install.json
 */
export function getInstallPath(): string {
  return path.join(getPalDir(), INSTALL_FILE);
}

/**
 * Ensure the PAL directory exists.
 */
function ensurePalDir(): void {
  const palDir = getPalDir();
  if (!fs.existsSync(palDir)) {
    fs.mkdirSync(palDir, { recursive: true });
  }
}

/**
 * Load installation metadata from ~/.pal/install.json.
 *
 * @returns Install metadata or null if not found
 */
export function loadInstallMetadata(): InstallMetadata | null {
  const installPath = getInstallPath();
  if (!fs.existsSync(installPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(installPath, "utf-8");
    return JSON.parse(content) as InstallMetadata;
  } catch (error) {
    console.warn(
      `Warning: Failed to load install metadata: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

/**
 * Save installation metadata to ~/.pal/install.json.
 *
 * @param metadata - Install metadata to save
 */
export function saveInstallMetadata(metadata: InstallMetadata): void {
  ensurePalDir();
  const installPath = getInstallPath();
  fs.writeFileSync(installPath, JSON.stringify(metadata, null, 2), "utf-8");
}

/**
 * Get the trusted publisher address from package.json.
 *
 * @returns Publisher address or null if not set
 */
export function getTrustedPublisher(): string | null {
  try {
    // Get the directory of this file (src/core/)
    const currentFilePath = fileURLToPath(import.meta.url);
    const coreDir = path.dirname(currentFilePath);
    // Go up to project root (from dist/core/ or src/core/)
    const projectRoot = path.resolve(coreDir, "..", "..");
    const packageJsonPath = path.join(projectRoot, "package.json");

    if (!fs.existsSync(packageJsonPath)) {
      // Try from current working directory
      const cwdPackageJson = path.join(process.cwd(), "package.json");
      if (!fs.existsSync(cwdPackageJson)) {
        return null;
      }
      const content = fs.readFileSync(cwdPackageJson, "utf-8");
      const pkg = JSON.parse(content) as { pal?: { publisher?: string } };
      return pkg.pal?.publisher || null;
    }

    const content = fs.readFileSync(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content) as { pal?: { publisher?: string } };
    return pkg.pal?.publisher || null;
  } catch {
    return null;
  }
}

/**
 * Get the version from package.json.
 *
 * @returns Version string or null if not found
 */
export function getPackageVersion(): string | null {
  try {
    const currentFilePath = fileURLToPath(import.meta.url);
    const coreDir = path.dirname(currentFilePath);
    const projectRoot = path.resolve(coreDir, "..", "..");
    const packageJsonPath = path.join(projectRoot, "package.json");

    if (!fs.existsSync(packageJsonPath)) {
      const cwdPackageJson = path.join(process.cwd(), "package.json");
      if (!fs.existsSync(cwdPackageJson)) {
        return null;
      }
      const content = fs.readFileSync(cwdPackageJson, "utf-8");
      const pkg = JSON.parse(content) as { version?: string };
      return pkg.version || null;
    }

    const content = fs.readFileSync(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content) as { version?: string };
    return pkg.version || null;
  } catch {
    return null;
  }
}

/**
 * Detect which package manager was used for the current installation.
 *
 * @returns "bun" or "npm"
 */
export function detectPackageManager(): "bun" | "npm" {
  // Check environment variable set during install
  if (process.env.PAL_PACKAGE_MANAGER) {
    return process.env.PAL_PACKAGE_MANAGER === "bun" ? "bun" : "npm";
  }

  // Check if bun is available and was likely used
  const execPath = process.execPath;
  if (execPath.includes("bun")) {
    return "bun";
  }

  // Check for bun's specific environment markers
  if (process.env.BUN_INSTALL) {
    return "bun";
  }

  // Default to npm if we can't detect bun
  return "npm";
}

/**
 * Get the installation path of the current PAL binary.
 *
 * @returns Installation path
 */
export function getBinaryInstallPath(): string {
  // Get the directory containing the pal binary
  const execPath = process.argv[1] || process.execPath;
  return path.dirname(path.dirname(execPath));
}

/**
 * Initialize install metadata on first run.
 * Creates install.json if it doesn't exist.
 *
 * @returns The install metadata (existing or newly created)
 */
export function initInstallMetadata(): InstallMetadata {
  const existing = loadInstallMetadata();
  if (existing) {
    return existing;
  }

  const version = getPackageVersion();
  const sourceAddress = getTrustedPublisher();
  const packageManager = detectPackageManager();

  const metadata: InstallMetadata = {
    version: version || "0.0.0",
    sourceAddress: sourceAddress || "",
    transactionId: "",
    installedAt: new Date().toISOString(),
    installPath: getBinaryInstallPath(),
    lastUpdateCheck: new Date().toISOString(),
    packageManager,
  };

  saveInstallMetadata(metadata);
  return metadata;
}

/**
 * Check if an update check is due (older than 7 days).
 *
 * @returns true if update check is due
 */
export function isUpdateCheckDue(): boolean {
  const metadata = loadInstallMetadata();
  if (!metadata) {
    return true;
  }

  const lastCheck = new Date(metadata.lastUpdateCheck);
  const now = new Date();
  const diffMs = now.getTime() - lastCheck.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  return diffDays > 7;
}

/**
 * Update the last update check timestamp.
 */
export function recordUpdateCheck(): void {
  const metadata = loadInstallMetadata();
  if (metadata) {
    metadata.lastUpdateCheck = new Date().toISOString();
    saveInstallMetadata(metadata);
  }
}
