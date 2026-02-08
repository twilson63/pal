import chalk from "chalk";
import {
  loadInstallMetadata,
  initInstallMetadata,
  getPackageVersion,
  getTrustedPublisher,
} from "../../core/install-tracker.js";

/**
 * Display version information.
 */
export async function versionCommand(): Promise<void> {
  // Ensure install metadata exists
  initInstallMetadata();

  const metadata = loadInstallMetadata();
  const version = getPackageVersion() || "unknown";
  const publisher = getTrustedPublisher();

  console.log(chalk.cyan("PAL Version Information"));
  console.log(chalk.gray("─".repeat(40)));
  console.log(`Version:        ${chalk.green(version)}`);

  if (metadata) {
    console.log(`Install Date:   ${metadata.installedAt}`);
    console.log(`Last Check:     ${metadata.lastUpdateCheck}`);
    console.log(`Package Manager: ${metadata.packageManager}`);

    if (metadata.sourceAddress) {
      const shortAddr =
        metadata.sourceAddress.slice(0, 8) + "..." + metadata.sourceAddress.slice(-8);
      console.log(`Publisher:      ${chalk.blue(shortAddr)}`);
    }

    if (metadata.transactionId) {
      const shortTx =
        metadata.transactionId.slice(0, 8) + "..." + metadata.transactionId.slice(-8);
      console.log(`Transaction:    ${chalk.gray(shortTx)}`);
    }
  }

  if (publisher && !metadata?.sourceAddress) {
    const shortAddr = publisher.slice(0, 8) + "..." + publisher.slice(-8);
    console.log(`Publisher:      ${chalk.blue(shortAddr)}`);
  }

  console.log(chalk.gray("─".repeat(40)));
}
