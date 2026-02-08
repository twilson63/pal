#!/usr/bin/env node
import { Command } from 'commander';
import { runCommand } from './commands/run.js';
import { initCommand } from './commands/init.js';
import { configCommand } from './commands/config.js';
import { cronCommand } from './commands/cron.js';

/**
 * Root commander program that registers all CLI commands.
 */
const program = new Command();

program
  .name('pal')
  .description('AI agent harness CLI using Vercel AI SDK')
  .version('0.1.0');

// Default command - run the agent
program
  .command('run', { isDefault: true })
  .description('Start the agent in the current directory')
  .option('--pwd <dir>', 'Set working directory')
  .argument('[text]', 'Text input for single-shot mode')
  .action((text, options) => runCommand(text, options));

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
