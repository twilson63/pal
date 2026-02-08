#!/usr/bin/env node
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

/**
 * Load Arweave wallet from file.
 */
function loadWallet(): Record<string, unknown> {
  const walletPath = path.join(
    process.env.HOME || "",
    ".arweave",
    "pal-publisher.json"
  );

  if (!fs.existsSync(walletPath)) {
    throw new Error(
      `Wallet not found at ${walletPath}. Please create an Arweave wallet and place it there.`
    );
  }

  const walletContent = fs.readFileSync(walletPath, "utf-8");
  return JSON.parse(walletContent);
}

/**
 * Calculate SHA256 hash of a file.
 */
function calculateHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Get wallet address from JWK.
 */
async function getWalletAddress(wallet: Record<string, unknown>): Promise<string> {
  // Dynamic import of arweave to avoid bundling
  const Arweave = (await import("arweave")).default;
  const arweave = Arweave.init({
    host: "arweave.net",
    port: 443,
    protocol: "https",
  });

  const jwk = wallet as { n: string; e: string; d: string; p: string; q: string; dp: string; dq: string; qi: string };
  return await arweave.wallets.jwkToAddress(jwk);
}

/**
 * Main publish function.
 */
async function publish(): Promise<void> {
  console.log("Starting Arweave publish process...\n");

  // 1. Run TypeScript build
  console.log("1. Running TypeScript build...");
  try {
    execSync("npm run build", { cwd: PROJECT_ROOT, stdio: "inherit" });
    console.log("✓ Build successful\n");
  } catch (error) {
    throw new Error(`Build failed: ${error}`);
  }

  // 2. Load package.json
  const packageJsonPath = path.join(PROJECT_ROOT, "package.json");
  const originalPackageJson = fs.readFileSync(packageJsonPath, "utf-8");
  const packageJson = JSON.parse(originalPackageJson) as {
    version: string;
    pal?: { publisher?: string; buildTimestamp?: string };
  };

  // 3. Load wallet
  console.log("2. Loading Arweave wallet...");
  const wallet = loadWallet();
  const address = await getWalletAddress(wallet);
  console.log(`✓ Wallet loaded: ${address.slice(0, 8)}...${address.slice(-8)}\n`);

  // 4. Update package.json with publisher info
  console.log("3. Setting publisher metadata...");
  packageJson.pal = {
    publisher: address,
    buildTimestamp: new Date().toISOString(),
  };
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2), "utf-8");
  console.log(`✓ Publisher set: ${address}`);
  console.log(`✓ Build timestamp: ${packageJson.pal.buildTimestamp}\n`);

  // 5. Run npm pack
  console.log("4. Creating tarball...");
  let tarballName: string;
  try {
    const output = execSync("npm pack", {
      cwd: PROJECT_ROOT,
      encoding: "utf-8",
    });
    tarballName = output.trim().split("\n").pop() || "";
    if (!tarballName) {
      throw new Error("Could not determine tarball name from npm pack output");
    }
    console.log(`✓ Created: ${tarballName}\n`);
  } catch (error) {
    // Restore original package.json on failure
    fs.writeFileSync(packageJsonPath, originalPackageJson, "utf-8");
    throw new Error(`npm pack failed: ${error}`);
  }

  // 6. Calculate SHA256 hash
  console.log("5. Calculating SHA256 hash...");
  const tarballPath = path.join(PROJECT_ROOT, tarballName);
  const sha256 = calculateHash(tarballPath);
  console.log(`✓ SHA256: ${sha256}\n`);

  // 7. Upload to Arweave
  console.log("6. Uploading to Arweave...");
  try {
    const Arweave = (await import("arweave")).default;
    const arweave = Arweave.init({
      host: "arweave.net",
      port: 443,
      protocol: "https",
    });

    // Check balance
    const balance = await arweave.wallets.getBalance(address);
    const balanceAR = arweave.ar.winstonToAr(balance);
    console.log(`   Wallet balance: ${balanceAR} AR`);

    // Read tarball data
    const data = fs.readFileSync(tarballPath);

    // Create transaction
    const transaction = await arweave.createTransaction({ data }, wallet);

    // Add tags
    transaction.addTag("App-Name", "pal");
    transaction.addTag("Version", packageJson.version);
    transaction.addTag("Type", "package");
    transaction.addTag("Signer-Address", address);
    transaction.addTag("Content-Type", "application/gzip");
    transaction.addTag("SHA-256", sha256);

    // Sign and post
    await arweave.transactions.sign(transaction, wallet);
    const response = await arweave.transactions.post(transaction);

    if (response.status === 200 || response.status === 202) {
      console.log(`✓ Upload successful!`);
      console.log(`✓ Transaction ID: ${transaction.id}`);
      console.log(`✓ Arweave URL: https://arweave.net/${transaction.id}`);
      console.log(`\nInstall with:`);
      console.log(`  bun install -g https://arweave.net/${transaction.id}`);
      console.log(`  npm install -g https://arweave.net/${transaction.id}`);
    } else {
      throw new Error(`Upload failed with status ${response.status}: ${response.statusText}`);
    }
  } catch (error) {
    throw new Error(`Arweave upload failed: ${error}`);
  } finally {
    // 8. Cleanup
    console.log("\n7. Cleaning up...");

    // Restore original package.json
    fs.writeFileSync(packageJsonPath, originalPackageJson, "utf-8");
    console.log("✓ Restored original package.json");

    // Remove tarball
    if (fs.existsSync(tarballPath)) {
      fs.unlinkSync(tarballPath);
      console.log("✓ Removed tarball");
    }
  }

  console.log("\n✓ Publish complete!");
}

// Run publish
publish().catch((error) => {
  console.error(`\n✗ Publish failed: ${error.message}`);
  process.exit(1);
});
