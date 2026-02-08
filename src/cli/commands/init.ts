import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { createInterface } from 'readline';

/**
 * Returns whether stdin/stdout are attached to an interactive terminal.
 *
 * @returns True when interactive prompts are supported.
 */
function isInteractiveTerminal(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

/**
 * Prompts for a single line of input in interactive mode.
 *
 * @param question Prompt text shown to the user.
 * @returns The entered answer without surrounding whitespace.
 */
function askQuestion(question: string): Promise<string> {
  if (!isInteractiveTerminal()) {
    return Promise.reject(new Error('Interactive input requires a TTY terminal.'));
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    const onClose = () => {
      reject(new Error('Input stream closed before receiving a response.'));
    };

    rl.once('close', onClose);
    try {
      rl.question(question, (answer) => {
        rl.removeListener('close', onClose);
        rl.close();
        resolve(answer.trim());
      });
    } catch {
      rl.removeListener('close', onClose);
      rl.close();
      reject(new Error('Interactive prompt is unavailable in this context.'));
    }
  });
}

/**
 * Creates or overwrites `agent.md` in the current working directory.
 *
 * @returns Resolves after writing the template or canceling overwrite.
 */
export async function initCommand(): Promise<void> {
  try {
    const agentMdPath = path.join(process.cwd(), 'agent.md');

    let agentFileExists = false;
    try {
      await fs.access(agentMdPath);
      agentFileExists = true;
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') {
        throw error;
      }
    }

    if (agentFileExists) {
      console.log(chalk.yellow('\n⚠️  An agent.md file already exists in this directory.\n'));

      if (!isInteractiveTerminal()) {
        throw new Error('agent.md already exists and cannot confirm overwrite in non-interactive mode. Re-run `pal init` in an interactive terminal or remove agent.md first.');
      }

      const overwrite = await askQuestion(chalk.blue('Do you want to overwrite it? [y/N]: '));

      if (overwrite.toLowerCase() !== 'y' && overwrite.toLowerCase() !== 'yes') {
        console.log(chalk.gray('\nCancelled. Existing agent.md preserved.\n'));
        return;
      }

      console.log();
    }

    const template = `---
name: assistant
description: A helpful AI assistant
model: anthropic/claude-sonnet-4.5
provider: anthropic
tools:
  - bash
  - readFile
  - writeFile
  - grep
  - webSearch
systemPrompt: |
  You are a helpful AI assistant. You can help with coding tasks, 
  file operations, and web searches. Always be concise and helpful.
---

## Context
Add any project-specific context here.
`;

    await fs.writeFile(agentMdPath, template, 'utf-8');
    console.log(chalk.green('✓ Created agent.md in current directory\n'));
    console.log(chalk.cyan('Next steps:'));
    console.log(chalk.gray('  1. Edit agent.md to customize your agent'));
    console.log(chalk.gray('  2. Run `pal` to start chatting with your agent\n'));
  } catch (error) {
    console.error(chalk.red('\n✗ Failed to initialize project:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
