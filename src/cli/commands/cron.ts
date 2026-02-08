import chalk from "chalk";
import {
  listCronJobs,
  removeCronJob,
  setCronEnabled,
  runCronJob,
  getCronLogPath,
} from "../../core/cron-manager.js";
import { readFile } from "node:fs/promises";

interface CronOptions {
  all?: boolean;
  tail?: number;
  follow?: boolean;
}

/**
 * Handle cron management commands
 * @param action - The subcommand to execute
 * @param id - Optional job ID (required for remove, enable, disable, logs, exec)
 * @param options - Command options
 * @returns Promise that resolves when the command completes
 */
export async function cronCommand(
  action: string,
  id: string | undefined,
  options: CronOptions
): Promise<void> {
  const workingDir = process.cwd();

  switch (action) {
    case "list":
      await handleList(options.all);
      break;

    case "remove":
      await handleRemove(id, workingDir);
      break;

    case "enable":
      await handleEnable(id, workingDir);
      break;

    case "disable":
      await handleDisable(id, workingDir);
      break;

    case "logs":
      await handleLogs(id, options.tail, options.follow);
      break;

    case "exec":
      await handleExec(id);
      break;

    default:
      console.error(chalk.red(`Unknown cron action: ${action}`));
      console.log(chalk.gray("Available actions: list, remove, enable, disable, logs, exec"));
      process.exit(1);
  }
}

/**
 * Handle the list subcommand
 */
async function handleList(all?: boolean): Promise<void> {
  const jobs = await listCronJobs({ all });

  if (jobs.length === 0) {
    console.log(chalk.yellow("No cron jobs found."));
    if (!all) {
      console.log(chalk.gray("Use --all to list jobs from all workspaces."));
    }
    return;
  }

  // Calculate column widths
  const idWidth = Math.max(4, ...jobs.map((j) => j.id.length));
  const nameWidth = Math.max(6, ...jobs.map((j) => (j.name || "").length));
  const scheduleWidth = Math.max(10, ...jobs.map((j) => j.schedule.length));

  // Print header
  console.log(
    `${chalk.cyan("ID".padEnd(idWidth))}  ` +
      `${chalk.cyan("Name".padEnd(nameWidth))}  ` +
      `${chalk.cyan("Schedule".padEnd(scheduleWidth))}  ` +
      `${chalk.cyan("Enabled")}  ` +
      `${chalk.cyan("Last Run")}`
  );

  console.log(
    "-".repeat(idWidth + 2 + nameWidth + 2 + scheduleWidth + 2 + 7 + 2 + 25)
  );

  // Print jobs
  for (const job of jobs) {
    const enabledStr = job.enabled
      ? chalk.green("Yes")
      : chalk.gray("No");
    const lastRunStr = job.lastRun
      ? chalk.gray(new Date(job.lastRun).toLocaleString())
      : chalk.gray("Never");

    console.log(
      `${job.id.padEnd(idWidth)}  ` +
        `${(job.name || "").padEnd(nameWidth)}  ` +
        `${chalk.yellow(job.schedule.padEnd(scheduleWidth))}  ` +
        `${enabledStr.padEnd(5)}  ` +
        `${lastRunStr}`
    );
  }

  console.log(chalk.gray(`\nTotal: ${jobs.length} job(s)`));
}

/**
 * Handle the remove subcommand
 */
async function handleRemove(id: string | undefined, workingDir: string): Promise<void> {
  if (!id) {
    console.error(chalk.red("Missing required argument: <id>"));
    console.log(chalk.gray("Usage: pal cron remove <id>"));
    process.exit(1);
  }

  try {
    await removeCronJob(id, workingDir);
    console.log(chalk.green(`✓ Cron job removed: ${id}`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`✗ Failed to remove cron job: ${message}`));
    process.exit(1);
  }
}

/**
 * Handle the enable subcommand
 */
async function handleEnable(id: string | undefined, workingDir: string): Promise<void> {
  if (!id) {
    console.error(chalk.red("Missing required argument: <id>"));
    console.log(chalk.gray("Usage: pal cron enable <id>"));
    process.exit(1);
  }

  try {
    await setCronEnabled(id, true, workingDir);
    console.log(chalk.green(`✓ Cron job enabled: ${id}`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`✗ Failed to enable cron job: ${message}`));
    process.exit(1);
  }
}

/**
 * Handle the disable subcommand
 */
async function handleDisable(id: string | undefined, workingDir: string): Promise<void> {
  if (!id) {
    console.error(chalk.red("Missing required argument: <id>"));
    console.log(chalk.gray("Usage: pal cron disable <id>"));
    process.exit(1);
  }

  try {
    await setCronEnabled(id, false, workingDir);
    console.log(chalk.green(`✓ Cron job disabled: ${id}`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`✗ Failed to disable cron job: ${message}`));
    process.exit(1);
  }
}

/**
 * Handle the logs subcommand
 */
async function handleLogs(
  id: string | undefined,
  tail?: number,
  follow?: boolean
): Promise<void> {
  if (!id) {
    console.error(chalk.red("Missing required argument: <id>"));
    console.log(chalk.gray("Usage: pal cron logs <id>"));
    process.exit(1);
  }

  const logPath = getCronLogPath(id);

  try {
    const content = await readFile(logPath, "utf-8");
    const lines = content.split("\n");

    // Default to 100 lines if not specified
    const lineCount = tail ?? 100;

    // Get the last N lines
    const lastLines = lines.slice(-lineCount);

    if (lastLines.length === 0 || (lastLines.length === 1 && lastLines[0] === "")) {
      console.log(chalk.gray("No log entries found."));
      return;
    }

    // Print log header
    console.log(chalk.cyan(`\n=== Log for job: ${id} ===\n`));

    // Print the logs
    for (const line of lastLines) {
      if (line) {
        console.log(line);
      }
    }

    // Note about follow mode
    if (follow) {
      console.log(chalk.gray("\n[Note: --follow not yet implemented, showing last entries]"));
    }

    console.log(); // Final newline
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.log(chalk.gray("No log file found for this job."));
    } else {
      const message = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`✗ Failed to read logs: ${message}`));
      process.exit(1);
    }
  }
}

/**
 * Handle the exec subcommand (internal execution path)
 */
async function handleExec(id: string | undefined): Promise<void> {
  if (!id) {
    console.error(chalk.red("Missing required argument: <id>"));
    console.log(chalk.gray("Usage: pal cron exec <id>"));
    process.exit(1);
  }

  try {
    const exitCode = await runCronJob(id);

    if (exitCode !== 0) {
      console.error(chalk.red(`✗ Cron job failed with exit code: ${exitCode}`));
      // Job is automatically disabled by runCronJob on failure
      process.exit(exitCode);
    }

    // Success
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(chalk.red(`✗ Failed to execute cron job: ${message}`));
    process.exit(1);
  }
}
