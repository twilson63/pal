#!/usr/bin/env node
import { Command } from 'commander';
import { runCommand } from './commands/run.js';
import { initCommand } from './commands/init.js';
import { configCommand } from './commands/config.js';

const program = new Command();

program
  .name('pal')
  .description('AI agent harness CLI using Vercel AI SDK')
  .version('0.1.0');

// Default command - run the agent
program
  .command('run', { isDefault: true })
  .description('Start the agent in the current directory')
  .argument('[text]', 'Text input for single-shot mode')
  .action((text) => runCommand(text));

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

program.parse();
