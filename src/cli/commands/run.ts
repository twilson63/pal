import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { ensureConfig, loadConfig } from '../../core/config.js';
import { loadAgentConfig } from '../../core/agent-loader.js';
import type { AgentConfig } from '../../core/types.js';
import { createAgent, runConversation, runTextMode } from '../../core/harness.js';
import { createTools } from '../../tools/index.js';
import { createModel } from '../../providers/index.js';
import { firstRunWizard } from '../prompts.js';

export async function runCommand(text?: string): Promise<void> {
  const agentMdPath = path.join(process.cwd(), 'agent.md');
  
  try {
    await fs.access(agentMdPath);
  } catch {
    console.log(chalk.yellow('No agent.md file found in the current directory.'));
    console.log(chalk.gray('Run `pal init` to create one.'));
    process.exit(1);
  }

  try {
    console.log(chalk.cyan('🤖 Loading agent configuration...'));
    const loadedAgentConfig = await loadAgentConfig(agentMdPath);
    const agentConfig = normalizeAgentModelConfig(loadedAgentConfig);
    console.log(chalk.green(`✓ Loaded agent: ${agentConfig.name || 'Unnamed'}`));

    const hasGlobalConfig = ensureConfig();
    if (!hasGlobalConfig) {
      console.log(chalk.yellow('\n⚠️  No global configuration found.'));
      await firstRunWizard();
    }

    const config = loadConfig();
    console.log(chalk.gray(`\nUsing provider: ${agentConfig.provider || config.defaultProvider}`));
    console.log(chalk.gray(`Model: ${agentConfig.model}\n`));

    const model = await createModel(agentConfig.provider, agentConfig.model);

    console.log(chalk.cyan('🔧 Initializing tools...'));
    const allTools = await createTools();
    const enabledTools = selectEnabledTools(agentConfig, allTools);
    console.log(chalk.green('✓ Tools ready\n'));

    const agent = await createAgent(agentConfig, enabledTools, model);

    if (text) {
      await runTextMode(agent, text);
    } else {
      await runConversation(agent);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red('\n✗ Failed to start agent:'), message);
    process.exit(1);
  }
}

export function normalizeAgentModelConfig(agentConfig: AgentConfig): AgentConfig {
  const provider = agentConfig.provider.trim().toLowerCase();
  const originalModel = agentConfig.model.trim();

  if (!provider) {
    throw new Error('Agent configuration error: provider is required.');
  }

  if (!originalModel) {
    throw new Error('Agent configuration error: model is required.');
  }

  let normalizedModel = originalModel;
  const providerPrefix = `${provider}/`;

  while (normalizedModel.toLowerCase().startsWith(providerPrefix)) {
    normalizedModel = normalizedModel.slice(providerPrefix.length);
  }

  if (!normalizedModel) {
    throw new Error(`Agent configuration error: invalid model '${originalModel}'.`);
  }

  return {
    ...agentConfig,
    provider,
    model: normalizedModel,
  };
}

export function selectEnabledTools(
  agentConfig: AgentConfig,
  allTools: Awaited<ReturnType<typeof createTools>>
): Record<string, (typeof allTools)[keyof typeof allTools]> {
  const configuredTools = agentConfig.tools.length > 0
    ? agentConfig.tools
    : Object.keys(allTools);

  const enabledToolNames = configuredTools
    .filter((toolConfig) => {
      if (typeof toolConfig === 'string') {
        return true;
      }
      return toolConfig.enabled !== false;
    })
    .map((toolConfig) => (typeof toolConfig === 'string' ? toolConfig : toolConfig.name));

  const availableTools = new Set(Object.keys(allTools));
  const unknownTools = enabledToolNames.filter((toolName) => !availableTools.has(toolName));

  if (unknownTools.length > 0) {
    throw new Error(
      `Agent configuration error: unknown tool(s): ${unknownTools.join(', ')}. Available tools: ${Object.keys(allTools).join(', ')}`
    );
  }

  const enabledTools: Record<string, (typeof allTools)[keyof typeof allTools]> = {};
  for (const toolName of enabledToolNames) {
    enabledTools[toolName] = allTools[toolName as keyof typeof allTools];
  }

  return enabledTools;
}
