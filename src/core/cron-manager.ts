import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";
import { spawn, execSync } from "node:child_process";
import { CronJob, CronJobSchema, CronJobWithStatus } from "./types.js";

/**
 * PAL directory name in home folder
 */
const PAL_DIR_NAME = ".pal";

/**
 * Cron store file name
 */
const CRON_STORE_FILE = "crons.json";

/**
 * Logs directory name
 */
const LOGS_DIR_NAME = "logs";

/**
 * Locks directory name
 */
const LOCKS_DIR_NAME = "locks";

/**
 * Crontab marker for PAL entries start
 */
const CRONTAB_START_MARKER = "# === PAL CRON JOBS START ===";

/**
 * Crontab marker for PAL entries end
 */
const CRONTAB_END_MARKER = "# === PAL CRON JOBS END ===";

/**
 * PAL job marker prefix in crontab
 */
const PAL_JOB_PREFIX = "# pal-cron:";

/**
 * Lock file stale timeout in milliseconds (10 minutes)
 */
const LOCK_STALE_TIMEOUT = 10 * 60 * 1000;

/**
 * PAL_CRON_START log marker
 */
const PAL_CRON_START_MARKER = "PAL_CRON_START";

/**
 * Get the path to the PAL directory
 * @returns The path to ~/.pal
 */
export function getPalDir(): string {
  return path.join(homedir(), PAL_DIR_NAME);
}

/**
 * Ensure the PAL directory and subdirectories exist
 */
function ensurePalDirs(): void {
  const palDir = getPalDir();
  if (!fs.existsSync(palDir)) {
    fs.mkdirSync(palDir, { recursive: true });
  }

  const logsDir = path.join(palDir, LOGS_DIR_NAME);
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const locksDir = path.join(palDir, LOCKS_DIR_NAME);
  if (!fs.existsSync(locksDir)) {
    fs.mkdirSync(locksDir, { recursive: true });
  }
}

/**
 * Get the path to the cron store file
 * @returns The path to ~/.pal/crons.json
 */
export function getCronStorePath(): string {
  return path.join(getPalDir(), CRON_STORE_FILE);
}

/**
 * Get the path to a cron job's log file
 * @param id - The cron job ID
 * @returns The path to ~/.pal/logs/<id>.log
 */
export function getCronLogPath(id: string): string {
  return path.join(getPalDir(), LOGS_DIR_NAME, `${id}.log`);
}

/**
 * Get the path to a cron job's lock file
 * @param id - The cron job ID
 * @returns The path to ~/.pal/locks/<id>.lock
 */
export function getCronLockPath(id: string): string {
  return path.join(getPalDir(), LOCKS_DIR_NAME, `${id}.lock`);
}

/**
 * Get the path to the PAL executable
 * @returns The absolute path to the pal executable
 */
function getPalExecutablePath(): string {
  // Try to find pal in PATH, fallback to current process
  try {
    const result = execSync("which pal", { encoding: "utf-8" }).trim();
    if (result) {
      return result;
    }
  } catch {
    // Fallback to current executable
  }

  return process.argv[0];
}

/**
 * Load all cron jobs from the store
 * @returns Array of cron jobs
 */
function loadCronStore(): CronJob[] {
  const storePath = getCronStorePath();

  if (!fs.existsSync(storePath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(storePath, "utf-8");
    const data = JSON.parse(content);

    if (!Array.isArray(data.jobs)) {
      return [];
    }

    // Validate each job
    const jobs: CronJob[] = [];
    for (const job of data.jobs) {
      const result = CronJobSchema.safeParse(job);
      if (result.success) {
        jobs.push(result.data);
      }
    }

    return jobs;
  } catch {
    return [];
  }
}

/**
 * Save cron jobs to the store
 * @param jobs - Array of cron jobs to save
 */
function saveCronStore(jobs: CronJob[]): void {
  ensurePalDirs();
  const storePath = getCronStorePath();

  try {
    fs.writeFileSync(
      storePath,
      JSON.stringify({ jobs }, null, 2),
      "utf-8"
    );
  } catch (error) {
    throw new Error(
      `Failed to save cron store: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Get the current user's crontab content
 * @returns The crontab content or empty string
 */
function getCurrentCrontab(): string {
  try {
    return execSync("crontab -l", { encoding: "utf-8" });
  } catch {
    return "";
  }
}

/**
 * Set the user's crontab content
 * @param content - The new crontab content
 */
function setCrontab(content: string): void {
  try {
    const child = spawn("crontab", ["-"], {
      stdio: ["pipe", "inherit", "inherit"],
    });

    child.stdin?.write(content);
    child.stdin?.end();

    const exitCode = child.exitCode ?? 0;
    if (exitCode !== 0) {
      throw new Error(`crontab command failed with exit code ${exitCode}`);
    }
  } catch (error) {
    throw new Error(
      `Failed to set crontab: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Generate PAL crontab entries from enabled jobs
 * @param jobs - Array of cron jobs
 * @returns Formatted crontab entries for PAL jobs
 */
function generatePalCrontabEntries(jobs: CronJob[]): string {
  const enabledJobs = jobs.filter((job) => job.enabled);

  if (enabledJobs.length === 0) {
    return "";
  }

  const palPath = getPalExecutablePath();
  const entries: string[] = [];

  for (const job of enabledJobs) {
    const logPath = getCronLogPath(job.id);
    const entry = `${PAL_JOB_PREFIX}${job.id}\n${job.schedule} cd "${job.workingDir}" && ${palPath} cron exec ${job.id} >> "${logPath}" 2>&1`;
    entries.push(entry);
  }

  return entries.join("\n");
}

/**
 * Sync the system crontab with PAL jobs
 * Preserves non-PAL entries and manages the PAL block
 */
function syncCrontab(): void {
  const jobs = loadCronStore();
  const currentCrontab = getCurrentCrontab();

  // Parse existing crontab to find non-PAL entries
  const lines = currentCrontab.split("\n");
  const nonPalLines: string[] = [];
  let inPalBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === CRONTAB_START_MARKER) {
      inPalBlock = true;
      continue;
    }

    if (trimmed === CRONTAB_END_MARKER) {
      inPalBlock = false;
      continue;
    }

    if (!inPalBlock && !trimmed.startsWith(PAL_JOB_PREFIX)) {
      nonPalLines.push(line);
    }
  }

  // Generate new PAL entries
  const palEntries = generatePalCrontabEntries(jobs);

  // Build new crontab
  let newCrontab = nonPalLines.join("\n").trim();

  if (palEntries) {
    if (newCrontab) {
      newCrontab += "\n\n";
    }
    newCrontab += `${CRONTAB_START_MARKER}\n${palEntries}\n${CRONTAB_END_MARKER}`;
  }

  // Ensure trailing newline
  if (!newCrontab.endsWith("\n")) {
    newCrontab += "\n";
  }

  setCrontab(newCrontab);
}

/**
 * Generate a random cron job ID
 * @returns A unique cron job ID (e.g., c_a1b2c3d4)
 */
function generateCronId(): string {
  const random = Math.random().toString(36).substring(2, 10);
  return `c_${random}`;
}

/**
 * Create a new cron job
 * @param input - Cron job data (without id and createdAt)
 * @returns The created cron job
 * @throws Error if crontab update fails (with rollback)
 */
export async function createCronJob(
  input: Omit<CronJob, "id" | "createdAt">
): Promise<CronJob> {
  // Validate input
  const tempJob = {
    ...input,
    id: "temp",
    createdAt: new Date().toISOString(),
  };

  const validation = CronJobSchema.safeParse(tempJob);
  if (!validation.success) {
    throw new Error(`Invalid cron job data: ${validation.error.message}`);
  }

  const jobs = loadCronStore();

  // Create new job
  const job: CronJob = {
    ...input,
    id: generateCronId(),
    createdAt: new Date().toISOString(),
  };

  // Save to store first
  const previousJobs = [...jobs];
  jobs.push(job);
  saveCronStore(jobs);

  // Try to update crontab
  try {
    syncCrontab();
  } catch (error) {
    // Rollback on failure
    saveCronStore(previousJobs);
    throw new Error(
      `Failed to update crontab, changes rolled back: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return job;
}

/**
 * List all cron jobs
 * @param options - Optional filter options
 * @returns Array of cron jobs with status
 */
export async function listCronJobs(
  options?: { all?: boolean }
): Promise<CronJobWithStatus[]> {
  const jobs = loadCronStore();
  const workingDir = process.cwd();

  const filteredJobs = options?.all
    ? jobs
    : jobs.filter((job) => job.workingDir === workingDir);

  // Add lastRun status for each job
  const jobsWithStatus: CronJobWithStatus[] = [];

  for (const job of filteredJobs) {
    const lastRun = await parseLastRunFromLog(job.id);
    jobsWithStatus.push({
      ...job,
      lastRun,
    });
  }

  return jobsWithStatus;
}

/**
 * Remove a cron job by ID
 * @param id - The cron job ID
 * @param workingDir - The working directory to verify
 * @throws Error if job not found or directory mismatch
 */
export async function removeCronJob(
  id: string,
  workingDir: string
): Promise<void> {
  const jobs = loadCronStore();

  const jobIndex = jobs.findIndex((job) => job.id === id);
  if (jobIndex === -1) {
    throw new Error(`Cron job not found: ${id}`);
  }

  const job = jobs[jobIndex];
  if (job.workingDir !== workingDir) {
    throw new Error(
      `Cannot remove job from different working directory: ${job.workingDir}`
    );
  }

  // Remove job
  jobs.splice(jobIndex, 1);
  saveCronStore(jobs);

  // Update crontab
  syncCrontab();

  // Clean up log file
  const logPath = getCronLogPath(id);
  if (fs.existsSync(logPath)) {
    try {
      fs.unlinkSync(logPath);
    } catch {
      // Ignore cleanup errors
    }
  }

  // Clean up lock file
  const lockPath = getCronLockPath(id);
  if (fs.existsSync(lockPath)) {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Enable or disable a cron job
 * @param id - The cron job ID
 * @param enabled - The new enabled status
 * @param workingDir - The working directory to verify
 * @throws Error if job not found or directory mismatch
 */
export async function setCronEnabled(
  id: string,
  enabled: boolean,
  workingDir: string
): Promise<void> {
  const jobs = loadCronStore();

  const job = jobs.find((j) => j.id === id);
  if (!job) {
    throw new Error(`Cron job not found: ${id}`);
  }

  if (job.workingDir !== workingDir) {
    throw new Error(
      `Cannot modify job from different working directory: ${job.workingDir}`
    );
  }

  if (job.enabled === enabled) {
    return; // No change needed
  }

  job.enabled = enabled;
  saveCronStore(jobs);

  // Update crontab (adds or removes entry)
  syncCrontab();
}

/**
 * Acquire a lock for a cron job with stale recovery
 * @param id - The cron job ID
 * @returns True if lock acquired, false otherwise
 */
function acquireLock(id: string): boolean {
  const lockPath = getCronLockPath(id);

  // Check if lock exists
  if (fs.existsSync(lockPath)) {
    try {
      const lockContent = fs.readFileSync(lockPath, "utf-8");
      const lockData = JSON.parse(lockContent);
      const lockTime = lockData.timestamp || 0;

      // Check if lock is stale (older than 10 minutes)
      if (Date.now() - lockTime > LOCK_STALE_TIMEOUT) {
        // Stale lock, remove it
        fs.unlinkSync(lockPath);
      } else {
        // Lock is still valid
        return false;
      }
    } catch {
      // Invalid lock file, remove it
      try {
        fs.unlinkSync(lockPath);
      } catch {
        return false;
      }
    }
  }

  // Create new lock
  try {
    ensurePalDirs();
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        pid: process.pid,
        timestamp: Date.now(),
      }),
      "utf-8"
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Release a lock for a cron job
 * @param id - The cron job ID
 */
function releaseLock(id: string): void {
  const lockPath = getCronLockPath(id);

  if (fs.existsSync(lockPath)) {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // Ignore release errors
    }
  }
}

/**
 * Run a cron job immediately
 * @param id - The cron job ID
 * @returns The exit code of the job execution
 * @throws Error if job not found or not enabled
 */
export async function runCronJob(id: string): Promise<number> {
  const jobs = loadCronStore();

  const job = jobs.find((j) => j.id === id);
  if (!job) {
    throw new Error(`Cron job not found: ${id}`);
  }

  if (!job.enabled) {
    throw new Error(`Cron job is disabled: ${id}`);
  }

  // Acquire lock with stale recovery
  if (!acquireLock(id)) {
    throw new Error(`Cron job is already running: ${id}`);
  }

  try {
    // Write start marker to log
    const logPath = getCronLogPath(id);
    ensurePalDirs();

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${PAL_CRON_START_MARKER}\n`;

    try {
      fs.appendFileSync(logPath, logEntry, "utf-8");
    } catch (error) {
      throw new Error(
        `Failed to write to log file: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    // Execute: spawn PAL with `cron exec` (return 0 for now as per requirements)
    // In a real implementation, this would execute the actual job
    // For now, we just return 0 to indicate success

    return 0;
  } finally {
    // Always release the lock
    releaseLock(id);
  }
}

/**
 * Validate a cron expression
 * @param schedule - The cron schedule expression
 * @returns Validation result with optional error message
 */
export function validateCronExpression(schedule: string): {
  valid: boolean;
  error?: string;
} {
  // Support aliases
  const aliases: Record<string, string> = {
    "@yearly": "0 0 1 1 *",
    "@annually": "0 0 1 1 *",
    "@monthly": "0 0 1 * *",
    "@weekly": "0 0 * * 0",
    "@daily": "0 0 * * *",
    "@hourly": "0 * * * *",
    "@reboot": "@reboot",
  };

  const normalizedSchedule = aliases[schedule] || schedule;

  // Handle @reboot specially
  if (normalizedSchedule === "@reboot") {
    return { valid: true };
  }

  // Standard cron: minute hour day month weekday
  const parts = normalizedSchedule.split(/\s+/);

  if (parts.length !== 5) {
    return {
      valid: false,
      error: `Invalid cron expression: expected 5 fields, got ${parts.length}`,
    };
  }

  const [minute, hour, day, month, weekday] = parts;

  // Validate each field with basic patterns
  const fieldValidators: Record<string, (value: string) => boolean> = {
    minute: (v) =>
      v === "*" ||
      /^\d{1,2}$/.test(v) ||
      /^\d{1,2}-\d{1,2}$/.test(v) ||
      /^\*\/\d+$/.test(v) ||
      /^\d{1,2}(,\d{1,2})*$/.test(v),
    hour: (v) =>
      v === "*" ||
      /^\d{1,2}$/.test(v) ||
      /^\d{1,2}-\d{1,2}$/.test(v) ||
      /^\*\/\d+$/.test(v) ||
      /^\d{1,2}(,\d{1,2})*$/.test(v),
    day: (v) =>
      v === "*" ||
      /^\d{1,2}$/.test(v) ||
      /^\d{1,2}-\d{1,2}$/.test(v) ||
      /^\*\/\d+$/.test(v) ||
      /^\d{1,2}(,\d{1,2})*$/.test(v),
    month: (v) =>
      v === "*" ||
      /^\d{1,2}$/.test(v) ||
      /^\d{1,2}-\d{1,2}$/.test(v) ||
      /^\*\/\d+$/.test(v) ||
      /^\d{1,2}(,\d{1,2})*$/.test(v) ||
      /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)$/i.test(v),
    weekday: (v) =>
      v === "*" ||
      /^\d$/.test(v) ||
      /^\d-\d$/.test(v) ||
      /^\*\/\d+$/.test(v) ||
      /^\d(,\d)*$/.test(v) ||
      /^(mon|tue|wed|thu|fri|sat|sun)$/i.test(v),
  };

  const fields = [
    { name: "minute", value: minute },
    { name: "hour", value: hour },
    { name: "day", value: day },
    { name: "month", value: month },
    { name: "weekday", value: weekday },
  ];

  for (const field of fields) {
    const validator = fieldValidators[field.name];
    if (!validator(field.value)) {
      return {
        valid: false,
        error: `Invalid ${field.name} field: ${field.value}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Parse the last run timestamp from a cron job's log file
 * @param id - The cron job ID
 * @returns The ISO timestamp of last run, or undefined if not found
 */
export async function parseLastRunFromLog(
  id: string
): Promise<string | undefined> {
  const logPath = getCronLogPath(id);

  if (!fs.existsSync(logPath)) {
    return undefined;
  }

  try {
    const content = fs.readFileSync(logPath, "utf-8");
    const lines = content.split("\n");

    // Find the last PAL_CRON_START marker
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      const markerIndex = line.indexOf(PAL_CRON_START_MARKER);

      if (markerIndex !== -1) {
        // Extract timestamp from the beginning of the line
        // Format: [ISO_TIMESTAMP] PAL_CRON_START
        const match = line.match(/^\[([^\]]+)\]/);
        if (match) {
          return match[1];
        }
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}
