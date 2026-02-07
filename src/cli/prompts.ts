import { createInterface } from 'readline';
import chalk from 'chalk';
import { saveConfig, setApiKey, config } from '../core/config.js';
import { SUPPORTED_PROVIDERS, type SupportedProvider } from '../providers/index.js';
import { PROVIDER_REGISTRY } from '../providers/registry.js';

function isInteractiveTerminal(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function getNonInteractiveSetupMessage(): string {
  return [
    'Interactive setup requires a TTY terminal.',
    'Run `pal config set defaultProvider <provider>` and `pal config set defaultModel <model>`, then set your provider API key via its environment variable.',
  ].join(' ');
}

export async function firstRunWizard(): Promise<void> {
  if (!isInteractiveTerminal()) {
    throw new Error(getNonInteractiveSetupMessage());
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = (question: string): Promise<string> => new Promise((resolve, reject) => {
    const onClose = () => {
      reject(new Error(getNonInteractiveSetupMessage()));
    };

    rl.once('close', onClose);
    try {
      rl.question(question, (answer) => {
        rl.removeListener('close', onClose);
        resolve(answer.trim());
      });
    } catch {
      rl.removeListener('close', onClose);
      reject(new Error(getNonInteractiveSetupMessage()));
    }
  });

  try {
    console.log(chalk.cyan('\n🎉 Welcome to pal!\n'));
    console.log(chalk.gray('Let\'s set up your AI provider configuration.\n'));

    // Show available providers
    console.log(chalk.cyan('Available providers:'));
    SUPPORTED_PROVIDERS.forEach((provider, index) => {
      const info = PROVIDER_REGISTRY[provider];
      console.log(chalk.gray(`  ${index + 1}. ${info.displayName} - ${info.description}`));
    });
    console.log();

    // Get provider selection
    let selectedProvider: SupportedProvider | null = null;
    while (!selectedProvider) {
      const input = await askQuestion(chalk.blue(`Select provider (1-${SUPPORTED_PROVIDERS.length}): `));
      const index = parseInt(input, 10) - 1;
      if (index >= 0 && index < SUPPORTED_PROVIDERS.length) {
        selectedProvider = SUPPORTED_PROVIDERS[index];
      } else {
        console.log(chalk.yellow(`Invalid selection. Please choose 1-${SUPPORTED_PROVIDERS.length}.`));
      }
    }

    const providerInfo = PROVIDER_REGISTRY[selectedProvider];
    console.log(chalk.green(`\n✓ Selected: ${providerInfo.displayName}\n`));

    // Get model name
    const defaultModel = providerInfo.defaultModel;
    const modelInput = await askQuestion(
      chalk.blue(`Model name (default: ${defaultModel}): `)
    );
    const modelName = modelInput || defaultModel;
    console.log(chalk.green(`✓ Model: ${modelName}\n`));

    // Get API key
    console.log(chalk.gray(`You need an API key from ${providerInfo.displayName}.`));
    console.log(chalk.gray(`Get one at: ${providerInfo.apiKeyUrl}\n`));

    const apiKey = await askQuestion(chalk.blue('API Key: '));

    if (!apiKey) {
      console.log(chalk.yellow('\n⚠️  No API key provided. You can set it later using:'));
      console.log(chalk.gray(`export ${providerInfo.envVarName}=your_api_key\n`));
    } else {
      setApiKey(selectedProvider, apiKey);
      console.log(chalk.green('\n✓ API key saved to ~/.pal/.env\n'));
    }

    // Save configuration
    config.defaultProvider = selectedProvider;
    config.defaultModel = modelName;
    config.providers[selectedProvider] = {
      defaultModel: modelName,
    };

    saveConfig(config);
    console.log(chalk.green('✓ Configuration saved to ~/.pal/config.json\n'));
    console.log(chalk.cyan('You\'re all set! Run `pal` to start using your agent.\n'));
  } finally {
    rl.close();
  }
}
