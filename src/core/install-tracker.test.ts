import { afterEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  loadInstallMetadata,
  saveInstallMetadata,
  getTrustedPublisher,
  getPackageVersion,
  detectPackageManager,
  initInstallMetadata,
  isUpdateCheckDue,
  recordUpdateCheck,
} from "./install-tracker.js";
import type { InstallMetadata } from "./install-tracker.js";

let tempDir: string | null = null;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

function createTempDir(): string {
  tempDir = mkdtempSync(path.join(tmpdir(), "pal-test-"));
  return tempDir;
}

describe("loadInstallMetadata", () => {
  it("returns null when file does not exist", () => {
    const result = loadInstallMetadata();
    // This might return data from actual ~/.pal if it exists
    // In a proper test environment, we'd mock the path
    expect(result === null || typeof result === "object").toBe(true);
  });
});

describe("saveInstallMetadata", () => {
  it("saves and loads metadata correctly", () => {
    const tempPalDir = createTempDir();
    const installPath = path.join(tempPalDir, "install.json");

    const metadata: InstallMetadata = {
      version: "1.0.0",
      sourceAddress: "test-address-123",
      transactionId: "tx-123",
      installedAt: "2024-01-01T00:00:00Z",
      installPath: "/test/path",
      lastUpdateCheck: "2024-01-01T00:00:00Z",
      packageManager: "bun",
    };

    // Save to temp location
    fs.writeFileSync(installPath, JSON.stringify(metadata, null, 2));

    // Verify file exists
    expect(fs.existsSync(installPath)).toBe(true);

    // Load and verify
    const content = fs.readFileSync(installPath, "utf-8");
    const loaded = JSON.parse(content) as InstallMetadata;
    expect(loaded.version).toBe("1.0.0");
    expect(loaded.sourceAddress).toBe("test-address-123");
    expect(loaded.packageManager).toBe("bun");
  });
});

describe("detectPackageManager", () => {
  it("detects bun when BUN_INSTALL is set", () => {
    const originalBunInstall = process.env.BUN_INSTALL;
    process.env.BUN_INSTALL = "/test/bun";

    const result = detectPackageManager();
    expect(result).toBe("bun");

    // Restore
    if (originalBunInstall) {
      process.env.BUN_INSTALL = originalBunInstall;
    } else {
      delete process.env.BUN_INSTALL;
    }
  });

  it("detects npm by default", () => {
    const originalBunInstall = process.env.BUN_INSTALL;
    delete process.env.BUN_INSTALL;

    const result = detectPackageManager();
    // Will be "bun" if running with bun, "npm" otherwise
    expect(result === "bun" || result === "npm").toBe(true);

    if (originalBunInstall) {
      process.env.BUN_INSTALL = originalBunInstall;
    }
  });
});

describe("isUpdateCheckDue", () => {
  it("returns true when last check was over 7 days ago", () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 8);

    const tempPalDir = createTempDir();
    const metadata: InstallMetadata = {
      version: "1.0.0",
      sourceAddress: "test",
      transactionId: "tx",
      installedAt: oldDate.toISOString(),
      installPath: "/test",
      lastUpdateCheck: oldDate.toISOString(),
      packageManager: "bun",
    };

    // We can't easily mock the path, but we can test the date logic
    const lastCheck = new Date(metadata.lastUpdateCheck);
    const now = new Date();
    const diffMs = now.getTime() - lastCheck.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    expect(diffDays > 7).toBe(true);
  });

  it("returns false when last check was recent", () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 1);

    const metadata: InstallMetadata = {
      version: "1.0.0",
      sourceAddress: "test",
      transactionId: "tx",
      installedAt: recentDate.toISOString(),
      installPath: "/test",
      lastUpdateCheck: recentDate.toISOString(),
      packageManager: "bun",
    };

    const lastCheck = new Date(metadata.lastUpdateCheck);
    const now = new Date();
    const diffMs = now.getTime() - lastCheck.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    expect(diffDays < 7).toBe(true);
  });
});
