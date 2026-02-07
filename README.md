# pal

Agent harness CLI using Vercel AI SDK

## Installation

```bash
bun install -g pal
```

## Quick Start

1. Run `pal` in your project directory
2. If no `agent.md` exists, you'll be prompted to create one
3. Configure your AI provider on first run
4. Start chatting with your agent!

## Configuration

Create an `agent.md` file in your project:

```markdown
---
name: build
description: Development agent
model: anthropic/claude-sonnet-4.5
provider: anthropic
tools:
  - bash
  - readFile
  - writeFile
  - grep
  - webSearch
systemPrompt: |
  You are a helpful coding assistant.
---
```

## Commands

- `pal` - Run the agent
- `pal init` - Create agent.md template
- `pal config` - Show configuration
- `pal config set <key> <value>` - Set config value
- `pal config get <key>` - Get config value

## OpenRouter Notes

If you use OpenRouter, free models may require enabling prompt publication/data policy settings in your OpenRouter account.

Known-good models that avoid that requirement in typical setups:

- `moonshotai/kimi-k2.5`
- `openai/gpt-4o-mini`
- `anthropic/claude-3.5-haiku`

## License

MIT
