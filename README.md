# pal

CLI agent harness built with the Vercel AI SDK.

`pal` runs from your project directory, loads an `agent.md` file, and gives you an interactive coding assistant with tool use.

## Features

- Provider-based model loading (`anthropic`, `openai`, `openrouter`, `google`, `mistral`, `ollama`)
- Tool-enabled agent runtime (`bash`, `readFile`, `writeFile`, `grep`, `webSearch`)
- Interactive chat mode and single-shot text mode
- Session conversation context with slash commands:
  - `/new` to reset context
  - `/context` to inspect message counts
  - `/model` to view model + current context size

## Installation

```bash
npm install
```

## Quick Start

1. Initialize your workspace config:

```bash
pal init
```

2. Edit `agent.md` as needed.
3. Run the assistant:

```bash
pal
```

4. Or run a one-shot prompt:

```bash
pal run "summarize this repository"
```

## agent.md Example

```markdown
---
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
  You are a helpful coding assistant.
---

## Context
Project-specific instructions go here.
```

## CLI Commands

- `pal` - Start interactive chat mode
- `pal run [text]` - Run interactive mode or single-shot text mode
- `pal init` - Create an `agent.md` template
- `pal config` - Show global configuration
- `pal config get <key>` - Read config value
- `pal config set <key> <value>` - Set config value

## Chat Slash Commands

- `/help` - List commands
- `/model` - Show current provider/model and context size
- `/context` - Show current conversation message counts
- `/new` - Start a fresh session (clear context)
- `/clear` - Clear terminal output
- `/exit` or `/quit` - Exit chat

## Development

```bash
npm run typecheck
bun test
npm run build
```

## License

MIT
