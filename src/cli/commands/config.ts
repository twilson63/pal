import chalk from 'chalk';
import { loadConfig, saveConfig, getConfigDir } from '../../core/config.js';

/**
 * Handles global configuration subcommands.
 *
 * @param action Requested config action (`show`, `get`, or `set`).
 * @param key Configuration key used by `get` and `set`.
 * @param value Configuration value used by `set`.
 * @returns Resolves when the requested action is complete.
 */
export async function configCommand(
  action?: string,
  key?: string,
  value?: string
): Promise<void> {
  if (!action || action === 'show') {
    // Show all config
    const cfg = loadConfig();
    const configDir = getConfigDir();
    
    console.log(chalk.cyan('\n📁 Configuration Directory:'));
    console.log(chalk.gray(`  ${configDir}\n`));
    
    console.log(chalk.cyan('⚙️  Global Configuration:\n'));
    console.log(chalk.gray('Default Provider:'), cfg.defaultProvider);
    console.log(chalk.gray('Default Model:'), cfg.defaultModel);
    
    if (Object.keys(cfg.providers).length > 0) {
      console.log(chalk.cyan('\n📦 Provider Configurations:\n'));
      for (const [provider, providerConfig] of Object.entries(cfg.providers)) {
        console.log(chalk.gray(`  ${provider}:`));
        if (providerConfig.defaultModel) {
          console.log(chalk.gray(`    Model: ${providerConfig.defaultModel}`));
        }
        if (providerConfig.baseUrl) {
          console.log(chalk.gray(`    Base URL: ${providerConfig.baseUrl}`));
        }
      }
    }
    
    console.log();
    return;
  }

  if (action === 'get') {
    if (!key) {
      console.log(chalk.yellow('\n⚠️  Please specify a key to get\n'));
      console.log(chalk.gray('Usage: pal config get <key>\n'));
      return;
    }

    const cfg = loadConfig();
    
    switch (key) {
      case 'defaultProvider':
        console.log(cfg.defaultProvider);
        break;
      case 'defaultModel':
        console.log(cfg.defaultModel);
        break;
      default:
        if (key.includes('.')) {
          const [provider, prop] = key.split('.');
          if (cfg.providers[provider]) {
            console.log(cfg.providers[provider][prop as keyof typeof cfg.providers[string]] || '');
          } else {
            console.log(chalk.yellow(`Provider '${provider}' not found`));
          }
        } else {
          console.log(chalk.yellow(`Unknown key: ${key}`));
        }
    }
    return;
  }

  if (action === 'set') {
    if (!key || !value) {
      console.log(chalk.yellow('\n⚠️  Please specify both key and value\n'));
      console.log(chalk.gray('Usage: pal config set <key> <value>\n'));
      return;
    }

    const cfg = loadConfig();
    
    switch (key) {
      case 'defaultProvider':
        cfg.defaultProvider = value;
        saveConfig(cfg);
        console.log(chalk.green(`✓ Set defaultProvider to: ${value}\n`));
        break;
      case 'defaultModel':
        cfg.defaultModel = value;
        saveConfig(cfg);
        console.log(chalk.green(`✓ Set defaultModel to: ${value}\n`));
        break;
      default:
        console.log(chalk.yellow(`\n⚠️  Unknown key: ${key}`));
        console.log(chalk.gray('Supported keys: defaultProvider, defaultModel\n'));
    }
    return;
  }

  console.log(chalk.yellow(`\n⚠️  Unknown action: ${action}`));
  console.log(chalk.gray('Supported actions: show, get, set\n'));
}
