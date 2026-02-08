#!/usr/bin/env node
import { Command } from 'commander';
import { runCommand } from './commands/run.js';
import { initCommand } from './commands/init.js';
import { configCommand } from './commands/config.js';
import { cronCommand } from './commands/cron.js';
import { updateCommand } from './commands/update.js';
import { versionCommand } from './commands/version.js';
import { initInstallMetadata, isUpdateCheckDue, recordUpdateCheck } from '../core/install-tracker.js';
import { checkForUpdate, applyUpdate, shouldSkipUpdateCheck } from '../core/update-manager.js';
import { confirmUpdatePrompt } from './prompts.js';
import chalk from 'chalk';

/**
 * Check for updates on startup if due.
 */
async function startupUpdateCheck(): Promise<void> {
  if (shouldSkipUpdateCheck()) {
    return;
  }

  if (!isUpdateCheckDue()) {
    return;
  }

  try {
    const update = await checkForUpdate();

    if (update) {
      console.log(chalk.yellow(`\nUpdate available: ${update.currentVersion} → ${update.newVersion}`));
      const shouldUpdate = await confirmUpdatePrompt(update.currentVersion, update.newVersion);

      if (shouldUpdate) {
        console.log(chalk.cyan('Applying update...'));
        const success = await applyUpdate(update);
        if (success) {
          console.log(chalk.green(`✓ Updated to ${update.newVersion}. Restart to use new version.\n`));
          process.exit(0);
        } else {
          console.error(chalk.red('✗ Update failed\n'));
        }
      }
    }
  } catch (error) {
    // Silently fail - don't block startup on update errors
  } finally {
    // Record that we performed the check regardless of outcome
    recordUpdateCheck();
  }
}

// Note: initInstallMetadata() is now called lazily in commands that need it
// (update, version) rather than on every CLI startup

/**
 * Root commander program that registers all CLI commands.
 */
const program = new Command();

program
  .name('pal')
  .description('AI agent harness CLI using Vercel AI SDK')
  .version('0.1.0');

// Update command
program
  .command('update')
  .description('Check and apply updates')
  .option('--check', 'Check only, do not apply')
  .option('--force', 'Force reinstall current version')
  .action(updateCommand);

// Version command (separate from --version flag)
program
  .command('version')
  .description('Show detailed version information')
  .action(versionCommand);

// Default command - run the agent
program
  .command('run', { isDefault: true })
  .description('Start the agent in the current directory')
  .option('--pwd <dir>', 'Set working directory')
  .option('--skip-update-check', 'Skip automatic update check')
  .argument('[text]', 'Text input for single-shot mode')
  .action(async (text, options) => {
    if (!options.skipUpdateCheck) {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), 5000);
      });
      try {
        await Promise.race([startupUpdateCheck(), timeoutPromise]);
      } catch {
        // Timeout or error - continue normally
      }
    }
    await runCommand(text, options);
  });

// Init command - create agent.md
program
  .command('init')
  .description('Initialize an agent.md file in the current directory')
  .action(initCommand);

// Config command
program
  .command('config')
  .description('Manage global configuration')
  .argument('[action]', 'Action: get, set, or show')
  .argument('[key]', 'Configuration key')
  .argument('[value]', 'Configuration value')
  .action((action, key, value) => configCommand(action, key, value));

// Cron command
program
  .command('cron')
  .description('Manage scheduled cron jobs')
  .argument('<action>', 'Action: list, remove, enable, disable, logs, exec')
  .argument('[id]', 'Job ID')
  .option('--all', 'Show all jobs across workspaces (list only)')
  .option('--tail <n>', 'Number of lines to show (logs only)', '100')
  .option('--follow', 'Follow log output (logs only)')
  .action((action, id, options) => cronCommand(action, id, options));

program.parse();
