# Agent Guidelines for pal

CLI agent harness built with the Vercel AI SDK. TypeScript project using ES modules.

## Build & Test Commands

```bash
# Build the project
npm run build

# Watch mode during development
npm run dev

# Run all tests (uses Bun test runner)
npm run test

# Run a single test file
bun test src/path/to/file.test.ts

# Type check without emitting
npm run typecheck

# Start the CLI
npm start
```

## Code Style

### TypeScript Configuration
- Target: ES2022 with NodeNext module resolution
- Strict mode enabled
- Source in `src/`, output in `dist/`
- Use `.js` extensions in import paths (required for NodeNext)

### Formatting
- 2-space indentation
- Double quotes for strings
- Semicolons required
- 100-120 character line length (pragmatic)

### Imports
- Group imports: external libraries first, then internal modules
- Always use `.js` extension for TypeScript imports:
  ```typescript
  import { loadAgentConfig } from "./agent-loader.js";
  ```
- Use `node:` prefix for Node.js built-ins:
  ```typescript
  import { readFile } from "node:fs/promises";
  ```

### Types & Naming
- Use `PascalCase` for:
  - Interfaces (`AgentConfig`, `ProviderInfo`)
  - Type aliases (`ToolMap`, `MessageRole`)
  - Zod schemas (`AgentConfigSchema`)
  
- Use `camelCase` for:
  - Functions (`loadAgentConfig`, `createTools`)
  - Variables and constants
  
- Use `UPPER_SNAKE_CASE` for:
  - Constants that are enums or lists (`TOOL_NAMES`, `SUPPORTED_PROVIDERS`)

- Prefix interfaces with descriptive words:
  - `Config` for configuration objects
  - `Info` for metadata descriptors
  - `Result` for function return types

### Type Definitions
- Use `interface` for object shapes that may be extended
- Use `type` for unions, mapped types, and complex compositions
- Use Zod schemas for runtime validation, derive TypeScript types with `z.infer`
- Export both the Zod schema and the TypeScript interface:
  ```typescript
  export const AgentConfigSchema = z.object({...});
  export interface AgentConfig extends z.infer<typeof AgentConfigSchema> {...}
  ```

### Error Handling
- Always check error types before accessing properties:
  ```typescript
  if (error instanceof z.ZodError) { ... }
  if ((error as NodeJS.ErrnoException).code === "ENOENT") { ... }
  ```
- Provide contextual error messages that include the original error
- Use early returns to reduce nesting

### Documentation
- Add JSDoc comments for all exported functions and types
- Use `@param` and `@returns` tags
- Describe the purpose in the first line, implementation details below

### Testing
- Use Bun's built-in test runner (`bun:test`)
- Import test functions explicitly:
  ```typescript
  import { afterEach, describe, expect, it } from "bun:test";
  ```
- Use `afterEach` for cleanup (temp directories, etc.)
- Test files: co-locate with source files as `*.test.ts`
- Helper functions for creating test fixtures (e.g., `makeAgentConfig`)

### Project Structure
```
src/
  cli/
    index.ts          # Entry point
    commands/         # CLI command implementations
    prompts.ts        # Interactive prompts
  core/
    types.ts          # Shared type definitions
    harness.ts        # Agent runtime
    agent-loader.ts   # Config loading
    config.ts         # Global config management
  providers/
    index.ts          # Provider factory functions
  tools/
    index.ts          # Tool definitions
```

### Dependencies
- Core: `ai` (Vercel SDK), `commander` (CLI), `zod` (validation), `yaml`
- Peer dependencies: `@ai-sdk/anthropic`, `@ai-sdk/openai` (optional)
- Runtime: `chalk`, `marked`, `dotenv`
- Use dynamic imports for optional peer dependencies with try/catch error handling
