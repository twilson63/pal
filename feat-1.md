# Session Context Feature

## Overview
Add conversation history/session context to pal so that the agent remembers previous exchanges within a session.

## Problem
Currently, each input to pal is independent. The agent has no memory of previous messages, making multi-turn conversations impossible.

## Solution
Accumulate conversation history and pass it to the agent with each request.

## Implementation Plan

### Files to Modify

1. **`src/core/harness.ts`**
   - Add `messages` array to `ConversationState`
   - Change from `prompt` parameter to `messages` parameter in `agent.stream()`
   - Accumulate user inputs and assistant responses
   - Add `/new` slash command to clear history
   - Add message counter/context indicator

### Technical Details

**Message Structure:**
```typescript
type Message = 
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string }
  | { role: 'tool'; content: string; toolCallId: string };
```

**Stream API Change:**
```typescript
// From:
agent.stream({ prompt: userInput })

// To:
agent.stream({ messages: conversationHistory })
```

### Features

- **Context Accumulation**: Every exchange stored in memory
- **Unlimited Context**: No artificial limits (model/provider handles token limits naturally)
- **`/new` Command**: Clear context and start fresh conversation
- **`/context` Command**: (Optional) Show current context size
- **No Persistence**: Context lost when `pal` exits
- **Context Indicator**: Show "Context: N messages" in `/model` command or startup

### Slash Commands

- `/new` - Clear conversation history and start fresh
- `/context` - Show number of messages in current context
- `/model` - Updated to show context size

### Design Decisions

1. **Context Window**: Unlimited accumulation
   - Rationale: Different models have different token limits and tokenizers
   - Let the model/provider handle context limit errors
   - User can `/new` when needed

2. **Tool Results in Context**:
   - Include tool calls and results in history
   - This allows agent to reference previous tool results

3. **Error Handling**:
   - If context exceeds model limit, display error message
   - User can then `/new` to clear and continue
   - Future: Could add auto-truncation of oldest messages

4. **No Session Persistence**:
   - Keep it simple - context only lasts during one `pal` invocation
   - Future enhancement could add session save/restore

### Open Questions

1. Should we show context size indicator in the main UI (e.g., "Context: 5 messages")?
2. Should we truncate automatically when approaching token limits, or let it fail?
3. Should tool calls be visible to user in context, or only the final responses?

### Testing

Test cases:
1. Multi-turn conversation with context
2. `/new` clears context
3. Tool calls included in context
4. Context size shown in `/model` command
5. Error handling when context too large

## Future Enhancements

- Session save/restore to disk
- Configurable context window limits
- Token count estimation per model
- Auto-truncation of old messages
- Named sessions

## Status

**Status**: Planned
**Priority**: High
**Estimated Effort**: Medium
