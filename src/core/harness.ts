import { ToolLoopAgent, type Tool, type LanguageModel } from "ai";
import { createInterface } from "readline";
import chalk from "chalk";
import { marked } from "marked";
import { markedTerminal } from "marked-terminal";
import { AgentConfig, Message } from "./types.js";

// Configure marked to use terminal renderer
marked.use(markedTerminal() as any);

function createSpinner(text: string) {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r${chalk.cyan(frames[i])} ${text}`);
    i = (i + 1) % frames.length;
  }, 80);
  return {
    stop: () => {
      clearInterval(interval);
      process.stdout.write('\r' + ' '.repeat(text.length + 2) + '\r');
    }
  };
}

export interface AgentInstance {
  agent: ToolLoopAgent;
  model: string;
  provider: string;
  name: string;
}

export interface ConversationState {
  isRunning: boolean;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/**
 * Create a ToolLoopAgent instance from configuration
 */
export async function createAgent(
  config: AgentConfig,
  tools: Record<string, Tool>,
  model?: LanguageModel
): Promise<AgentInstance> {
  const modelId = `${config.provider}/${config.model}`;

  const instructions = config.systemPrompt || "You are a helpful AI assistant.";

  const agent = new ToolLoopAgent({
    model: model ?? modelId,
    instructions,
    tools,
  });

  return {
    agent,
    model: config.model,
    provider: config.provider,
    name: config.name,
  };
}

/**
 * Run the main conversation loop
 */
export async function runConversation(
  agentInstance: AgentInstance
): Promise<void> {
  const state: ConversationState = {
    isRunning: true,
    messages: [] as Array<{ role: 'user' | 'assistant'; content: string }>,
  };

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const promptUser = (): Promise<string | null> => {
    return new Promise((resolve) => {
      const onClose = () => {
        resolve(null);
      };

      rl.once("close", onClose);
      try {
        rl.question(chalk.cyan(">> "), (input) => {
          rl.removeListener("close", onClose);
          resolve(input);
        });
      } catch {
        rl.removeListener("close", onClose);
        resolve(null);
      }
    });
  };

  console.log(chalk.hex('#FFA500')(agentInstance.name + ": ") + "Hello! I'm ready to help. Type /help for available commands.");
  console.log(chalk.gray("Using model: " + agentInstance.model));
  console.log();

  try {
    while (state.isRunning) {
      const userInput = await promptUser();
      if (userInput === null) {
        state.isRunning = false;
        break;
      }
      const trimmedInput = userInput.trim();

      if (!trimmedInput) {
        continue;
      }

      if (trimmedInput.startsWith("/")) {
        const handled = await handleSlashCommand(trimmedInput, state, agentInstance);
        if (!handled) {
          state.isRunning = false;
          break;
        }
        continue;
      }

      // Add user message to conversation history
      state.messages.push({
        role: 'user',
        content: trimmedInput,
      });

      try {
        const spinner = createSpinner('Thinking...');
        let hasOutput = false;
        let isExecutingTool = false;
        let hasToolError = false;
        let responseBuffer = '';
        
        const stream = await agentInstance.agent.stream({
          messages: state.messages,
        });

        for await (const part of stream.fullStream) {
          switch (part.type) {
            case 'text-delta':
              responseBuffer += part.text;
              break;
            case 'tool-call':
              // Tool call output suppressed
              break;
            case 'tool-result':
              isExecutingTool = false;
              break;
            case 'error':
              spinner.stop();
              hasToolError = true;
              console.error(chalk.red('\n[Error] ') + String((part as any).error));
              break;
          }
        }

        if (!hasOutput && !hasToolError && responseBuffer.trim()) {
          hasOutput = true;
        }

        if (!hasOutput && !hasToolError) {
          spinner.stop();
          console.log(chalk.gray('(No response generated - this model may not support tools)'));
        } else if (hasOutput) {
          spinner.stop();
          process.stdout.write(chalk.hex('#FFA500')(agentInstance.name + ': '));
          const rendered = marked.parse(responseBuffer) as string;
          console.log(rendered);

          // Add assistant response to conversation history
          state.messages.push({
            role: 'assistant',
            content: responseBuffer,
          });
        }
      } catch (error) {
        console.error(chalk.red('\nError: ') + (error instanceof Error ? error.message : String(error)));
      }

      console.log();
    }
  } finally {
    rl.close();
  }
}

/**
 * Handle slash commands
 * Returns true if conversation should continue, false to exit
 */
async function handleSlashCommand(
  input: string,
  state: ConversationState,
  agentInstance: AgentInstance
): Promise<boolean> {
  const [command] = input.slice(1).split(" ");

  switch (command.toLowerCase()) {
    case "exit":
    case "quit":
      console.log(chalk.yellow("Goodbye!"));
      return false;

    case "clear":
      console.clear();
      return true;

    case "new":
      state.messages = [];
      console.log(chalk.yellow("Started a new conversation. Context cleared."));
      return true;

    case "context":
      console.log(chalk.yellow("\nConversation context:"));
      console.log(`  Messages: ${state.messages.length}`);
      if (state.messages.length > 0) {
        const userMessages = state.messages.filter(m => m.role === 'user').length;
        const assistantMessages = state.messages.filter(m => m.role === 'assistant').length;
        console.log(`    User: ${userMessages}`);
        console.log(`    Assistant: ${assistantMessages}`);
      }
      console.log();
      return true;

    case "help":
      console.log(chalk.yellow("\nAvailable commands:"));
      console.log("  /exit, /quit  - Exit the conversation");
      console.log("  /clear        - Clear the terminal screen");
      console.log("  /new          - Start a new conversation (clear context)");
      console.log("  /context      - Show conversation context size");
      console.log("  /model        - Show current model information");
      console.log("  /help         - Show this help message");
      console.log();
      return true;

    case "model":
      console.log(chalk.yellow("\nCurrent model:"));
      console.log(`  Provider: ${agentInstance.provider}`);
      console.log(`  Model: ${agentInstance.model}`);
      console.log(`  Context: ${state.messages.length} messages`);
      console.log();
      return true;

    default:
      console.log(chalk.red(`Unknown command: /${command}`));
      console.log(chalk.gray("Type /help for available commands."));
      return true;
  }
}

export async function runTextMode(
  agentInstance: AgentInstance,
  prompt: string
): Promise<void> {
  try {
    const stream = await agentInstance.agent.stream({
      prompt: prompt.trim(),
    });

    let responseBuffer = '';

    for await (const part of stream.fullStream) {
      switch (part.type) {
        case 'text-delta':
          responseBuffer += part.text;
          break;
        case 'error':
          console.error(chalk.red('\n[Error] ') + String((part as any).error));
          break;
      }
    }

    // Render as markdown for clean text output
    const rendered = marked.parse(responseBuffer) as string;
    console.log(rendered);
  } catch (error) {
    console.error(chalk.red('Error: ') + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  }
}
