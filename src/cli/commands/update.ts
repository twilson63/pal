import chalk from "chalk";
import {
  checkForUpdate,
  getLatestPackageInfo,
  applyUpdate,
  getUpdateStatus,
  UpdateInfo,
} from "../../core/update-manager.js";
import { recordUpdateCheck } from "../../core/install-tracker.js";
import { confirmUpdatePrompt } from "../prompts.js";

interface UpdateOptions {
  check?: boolean;
  force?: boolean;
}

/**
 * Handle the update command.
 *
 * @param options - Command options
 */
export async function updateCommand(options: UpdateOptions = {}): Promise<void> {
  try {
    if (options.check) {
      // Check only mode
      console.log(chalk.cyan("Checking for updates..."));
      const update = await checkForUpdate();
      recordUpdateCheck();

      if (update) {
        console.log(
          chalk.yellow(
            `Update available: ${update.currentVersion} → ${update.newVersion}`
          )
        );
        process.exit(0);
      } else {
        const status = getUpdateStatus();
        console.log(chalk.green(`Already up to date (${status.currentVersion})`));
        process.exit(0);
      }
    }

    if (options.force) {
      // Force reinstall current version
      console.log(chalk.cyan("Force reinstalling current version..."));
      const update = await getLatestPackageInfo();
      if (!update) {
        const status = getUpdateStatus();
        console.log(chalk.yellow(`No update information available (${status.currentVersion})`));
        process.exit(1);
      }

      console.log(chalk.yellow(`Reinstalling ${update.newVersion}...`));
      const success = await applyUpdate(update, { force: true });
      process.exit(success ? 0 : 1);
    }

    // Normal update flow
    console.log(chalk.cyan("Checking for updates..."));
    const update = await checkForUpdate();
    recordUpdateCheck();

    if (!update) {
      const status = getUpdateStatus();
      if (status.error) {
        console.error(chalk.red(`Error checking for updates: ${status.error}`));
        process.exit(1);
      }
      console.log(chalk.green(`Already up to date (${status.currentVersion})`));
      process.exit(0);
    }

    console.log(
      chalk.yellow(
        `Update available: ${update.currentVersion} → ${update.newVersion}`
      )
    );

    const shouldUpdate = await confirmUpdatePrompt(
      update.currentVersion,
      update.newVersion
    );

    if (!shouldUpdate) {
      console.log(chalk.gray("Update cancelled."));
      process.exit(0);
    }

    console.log(chalk.cyan("Applying update..."));
    const success = await applyUpdate(update);

    if (success) {
      console.log(chalk.green(`✓ Successfully updated to ${update.newVersion}`));
      process.exit(0);
    } else {
      console.error(chalk.red("✗ Update failed"));
      process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`Error: ${message}`));
    process.exit(1);
  }
}
