# Feature Plan: Cron/Scheduling Capability

## Overview
Add first-class cron scheduling so agents can create recurring tasks from natural language. Management stays in CLI (`pal cron ...`) while creation is primarily via tool calls in agent chat.

Key v1 principles:
- Source of truth is `~/.pal/crons.json`.
- Jobs are host-level storage but workspace-scoped by `workingDir`.
- Crontab only runs an internal command: `pal cron exec <job-id>`.
- Non-PAL crontab entries are never modified.

## Product Decisions (Locked)

### Scope and UX
- Schedule creation should work via natural language through the agent tool (`scheduleCron`).
- `scheduleCron` is restricted to current workspace (`process.cwd()`) only.
- Only `agent.md` is supported (no custom agent config filename/path in v1).
- If user says "schedule this command", use most recent non-scheduling user request as prompt.
- If there is no prior runnable request, ask user to provide prompt.
- If schedule language is ambiguous, agent must clarify until deterministic cron expression is possible.
- No extra confirmation step once intent is clear.

### Workspace Scoping
- Jobs are stored globally in `~/.pal/crons.json` but include `workingDir`.
- `pal cron list` defaults to current workspace.
- `pal cron list --all` shows all jobs across host.
- `pal cron enable|disable|remove <id>` can only target jobs in current workspace.

### Runtime Behavior
- Timezone is host system timezone only.
- Concurrency policy is skip-overlap (v1): if lock exists, skip run.
- Lock files: `~/.pal/locks/<job-id>.lock` with stale lock recovery.
- `lastRun` definition: last attempt started.
- `lastRun` is derived from log markers, not persisted by runtime JSON mutation.
- Auto-disable on first non-zero exit from `pal cron exec <job-id>`.
- `skipped_due_to_lock` is not a failure and does not auto-disable.

### Data and Sync Semantics
- `~/.pal/crons.json` is canonical.
- Crontab is fully derived from enabled PAL jobs.
- PAL manager preserves non-PAL crontab lines exactly.
- On create/update/remove/toggle, if crontab apply fails after JSON write, rollback JSON change.
- Disabled jobs remain in JSON (`enabled: false`) and are removed from crontab.

### Logging
- One log file per job: `~/.pal/logs/<job-id>.log`.
- No built-in log rotation in v1 (single unbounded file).
- Structured run-start marker required, e.g. `PAL_CRON_START ts=<iso> job=<id>`.
- Failure details live in logs only.

## Architecture

### 1. Types (`src/core/types.ts`)
Add cron types and schemas:
- `CronJob` interface with fields:
  - `id: string` (opaque, immutable, e.g. `c_<random>`)
  - `name: string`
  - `schedule: string`
  - `prompt: string`
  - `workingDir: string`
  - `enabled: boolean`
  - `createdAt: string` (ISO timestamp)
- Optional runtime projection type for listing:
  - `CronJobWithStatus` includes derived `lastRun?: string`
- `CronJobSchema` and `CronStoreSchema` (`{ jobs: CronJob[] }`)

### 2. Cron Manager (`src/core/cron-manager.ts`)
Core responsibilities:
- Persist/read canonical store from `~/.pal/crons.json`.
- Read/write system crontab while preserving non-PAL entries.
- Rebuild PAL crontab block from enabled jobs.
- Rollback JSON changes if crontab apply fails.
- Parse logs to derive `lastRun`.

Suggested API:
- `createCronJob(input): Promise<CronJob>`
- `listCronJobs(options): Promise<CronJobWithStatus[]>`
- `removeCronJob(id, scope): Promise<void>`
- `setCronEnabled(id, enabled, scope): Promise<void>`
- `runCronJob(id): Promise<number>` (used by `pal cron exec <id>`)
- `validateCronExpression(schedule): { valid: boolean; error?: string }`
- `parseLastRunFromLog(id): Promise<string | undefined>`

Crontab entry format (PAL-managed):
```
# pal-cron:<job-id>
*/15 * * * * <ABSOLUTE_PAL_PATH> cron exec <job-id> >> ~/.pal/logs/<job-id>.log 2>&1
```

Notes:
- Do not embed prompt or working directory in crontab.
- `cron exec` loads everything by ID from JSON.

### 3. Cron Execution Path (`pal cron exec`)
Add internal command path under CLI:
- `pal cron exec <job-id>` (internal, but callable)

Execution flow:
1. Load job from JSON; ensure enabled.
2. Acquire lock (`~/.pal/locks/<job-id>.lock`) with stale recovery.
3. Write `PAL_CRON_START` marker.
4. Run prompt in job workspace with `pal run --pwd "<workingDir>" "<prompt>"` (or equivalent direct internal call).
5. On non-zero exit: auto-disable job and sync crontab immediately.
6. Release lock.

### 4. Run Command Enhancement (`src/cli/commands/run.ts`)
Add `--pwd <dir>` support:
- `pal run --pwd <dir> [text]`
- Resolve `agent.md` from `pwd` directory.
- Execute as if launched from that directory (workspace-local behavior).

### 5. Agent Tool (`src/tools/cron.ts`)
Tool definitions:
- `scheduleCron`:
  - inputs: `name`, `schedule`, optional `prompt`
  - defaults `workingDir` to current workspace only
  - validates deterministic schedule
  - uses previous non-scheduling user request when prompt omitted and user asked "schedule this"
- `listCrons` (current workspace by default)
- `removeCron` (workspace-scoped)
- `toggleCron` (enable/disable, workspace-scoped)

Agent behavior contract:
- Must ask clarifying questions for ambiguous time expressions.
- Must confirm final resolved cron expression in response before/with scheduling action.

### 6. CLI Cron Command (`src/cli/commands/cron.ts`)
Subcommands:
- `pal cron list [--all]`
- `pal cron remove <id>` (current workspace only)
- `pal cron enable <id>` (current workspace only)
- `pal cron disable <id>` (current workspace only)
- `pal cron logs <id> [--tail <n>] [--follow]`
- `pal cron exec <id>` (internal execution path)

## Storage Layout
- Metadata store: `~/.pal/crons.json`
- Logs: `~/.pal/logs/<job-id>.log`
- Locks: `~/.pal/locks/<job-id>.lock`
- Scheduler backend: system crontab (Unix/macOS)

## Error Handling
- Invalid/ambiguous schedule: reject with actionable guidance.
- Unknown job ID: clear not-found error.
- Cross-workspace mutation attempt: reject with scope error.
- Crontab command failures: surface error and keep JSON/crontab consistency via rollback.
- Missing workspace/`agent.md` at runtime: log failure, auto-disable, remove from crontab.

## Security and Safety
- Use absolute PAL executable path in crontab entries.
- Keep command surface minimal in crontab (`pal cron exec <id>` only).
- Avoid shell interpolation of user prompt in crontab lines.

## Files to Create/Modify
1. `src/core/types.ts` - Add cron job/store/status types and schemas
2. `src/core/cron-manager.ts` - New module for store + crontab + logs + execution
3. `src/tools/cron.ts` - New scheduling/management tools
4. `src/tools/index.ts` - Register cron tools and include in defaults
5. `src/cli/commands/cron.ts` - New cron subcommands (`list`, `enable`, `disable`, `remove`, `logs`, `exec`)
6. `src/cli/commands/run.ts` - Add `--pwd` support
7. `src/cli/index.ts` - Register `cron` command and run options
8. `src/core/types.ts` - Update `DEFAULT_AGENT_CONFIG.tools` to include cron tools

## Success Criteria

This feature is successful when all of the following are true:

1. **Natural-language scheduling works in agent chat**
   - A user can request scheduling in plain language (e.g., hourly, daily at 9am).
   - If timing is ambiguous, the agent asks clarifying questions until a deterministic schedule is resolved.
   - `scheduleCron` creates a job only after schedule and prompt are concrete.

2. **Workspace-scoped management is correct**
   - `pal cron list` shows only jobs for the current workspace by default.
   - `pal cron list --all` shows jobs across all workspaces.
   - `pal cron enable|disable|remove <id>` only operates on jobs in the current workspace.

3. **Canonical store and crontab stay consistent**
   - `~/.pal/crons.json` is the source of truth.
   - Crontab contains only derived PAL entries for enabled jobs.
   - Non-PAL crontab entries are preserved untouched.
   - If crontab apply fails, JSON changes are rolled back.

4. **Execution reliability is enforced**
   - Crontab entries execute `pal cron exec <job-id>` using an absolute PAL path.
   - Overlapping triggers are skipped via lock file.
   - Stale locks are recovered safely.
   - A non-zero run exit auto-disables the job immediately and removes it from crontab.
   - Lock skip events do not auto-disable jobs.

5. **Observability is usable**
   - Each run writes a structured start marker (`PAL_CRON_START ts=<iso> job=<id>`).
   - `lastRun` is correctly derived from logs as "last attempt started."
   - `pal cron logs <id>` shows last 100 lines by default and supports `--tail` and `--follow`.

6. **Run path supports workspace execution**
   - `pal run --pwd <dir>` runs using that directory's `agent.md` and local environment behavior.

7. **Quality gate passes**
   - Unit/CLI tests listed in the plan are implemented and passing.
   - Typecheck and build pass without regressions in existing commands.

## Testing Plan (Required)
- Unit tests for cron expression validation (5-field + aliases).
- Unit tests for PAL crontab render/parse while preserving non-PAL lines.
- Unit tests for workspace scoping (`list` default, `--all`, mutation restrictions).
- Unit tests for rollback behavior when crontab apply fails.
- Unit tests for lock handling and stale lock recovery.
- Unit tests for auto-disable on first non-zero exit.
- Unit tests for log marker parsing and derived `lastRun`.
- CLI tests for `pal cron logs --tail/--follow` behavior (or adapter-level tests if integration is hard).

## Out of Scope (v1)
- Windows Task Scheduler support.
- Per-job timezone.
- Queueing policy for overlaps.
- Custom agent config filenames/paths.
- Built-in log rotation.
