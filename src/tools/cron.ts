import { tool } from "ai";
import { z } from "zod";
import {
  createCronJob,
  listCronJobs,
  removeCronJob,
  setCronEnabled,
  validateCronExpression,
} from "../core/cron-manager.js";

/**
 * Cron job data shape from cron-manager.
 */
interface CronJobData {
  id: string;
  name: string;
  schedule: string;
  workingDir: string;
  prompt?: string;
  enabled: boolean;
}

/**
 * Cron job result shape returned from tool execution.
 */
export interface CronJobResult {
  success: boolean;
  job?: {
    id: string;
    name: string;
    schedule: string;
    workingDir: string;
    prompt?: string;
    enabled: boolean;
  };
  jobs?: Array<{
    id: string;
    name: string;
    schedule: string;
    workingDir: string;
    prompt?: string;
    enabled: boolean;
    status?: string;
  }>;
  error?: string;
}

const scheduleCronSchema = z.object({
  name: z.string().describe("A unique name for the cron job"),
  schedule: z.string().describe("Cron expression (5 fields: minute hour day month day-of-week)"),
  prompt: z.string().optional().describe("Optional prompt to run when the job executes"),
});

/**
 * Creates a new cron job with a deterministic schedule.
 */
export const scheduleCron = tool({
  description: `Schedule a new cron job with a deterministic schedule.
Validates the cron expression before creating.
Returns the created job details or an error if the schedule is invalid.`,
  inputSchema: scheduleCronSchema,
  execute: async (params: z.infer<typeof scheduleCronSchema>): Promise<CronJobResult> => {
    const { name, schedule, prompt } = params;
    const workingDir = process.cwd();

    try {
      const validation = validateCronExpression(schedule);
      if (!validation.valid) {
        return {
          success: false,
          error: `Invalid cron expression: "${schedule}". ${validation.error || 'Expected format: "minute hour day month day-of-week" (5 fields).'}.`,
        };
      }

      const job = await createCronJob({
        name,
        schedule,
        workingDir,
        prompt: prompt || "",
        enabled: true,
      });

      return {
        success: true,
        job: {
          id: job.id,
          name: job.name,
          schedule: job.schedule,
          workingDir: job.workingDir,
          prompt: job.prompt,
          enabled: job.enabled,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      return {
        success: false,
        error: `Failed to schedule cron job: ${errorMessage}`,
      };
    }
  },
});

const listCronsSchema = z.object({
  all: z.boolean().default(false).describe("List all jobs across workspaces (default: false - only current workspace)"),
});

/**
 * Lists cron jobs for the current workspace or all workspaces.
 */
export const listCrons = tool({
  description: `List all scheduled cron jobs.
By default, shows only jobs for the current workspace.
Set all=true to see jobs across all workspaces.`,
  inputSchema: listCronsSchema,
  execute: async (params: z.infer<typeof listCronsSchema>): Promise<CronJobResult> => {
    const { all } = params;
    const workingDir = process.cwd();

    try {
      const jobs = await listCronJobs({ all }) as CronJobData[];

      return {
        success: true,
        jobs: jobs.map((job: CronJobData) => ({
          id: job.id,
          name: job.name,
          schedule: job.schedule,
          workingDir: job.workingDir,
          prompt: job.prompt,
          enabled: job.enabled,
          status: job.enabled ? "active" : "paused",
        })),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      return {
        success: false,
        error: `Failed to list cron jobs: ${errorMessage}`,
      };
    }
  },
});

const removeCronSchema = z.object({
  id: z.string().describe("The ID of the cron job to remove"),
});

/**
 * Removes a cron job from the current workspace.
 */
export const removeCron = tool({
  description: `Remove a cron job by ID.
Only removes jobs from the current workspace.
Returns success confirmation or error if job not found.`,
  inputSchema: removeCronSchema,
  execute: async (params: z.infer<typeof removeCronSchema>): Promise<CronJobResult> => {
    const { id } = params;
    const workingDir = process.cwd();

    try {
      await removeCronJob(id, workingDir);

      return {
        success: true,
        error: undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      return {
        success: false,
        error: `Failed to remove cron job: ${errorMessage}`,
      };
    }
  },
});

const toggleCronSchema = z.object({
  id: z.string().describe("The ID of the cron job to toggle"),
  enabled: z.boolean().describe("Whether to enable (true) or disable (false) the job"),
});

/**
 * Enables or disables a cron job in the current workspace.
 */
export const toggleCron = tool({
  description: `Enable or disable a cron job by ID.
Only toggles jobs in the current workspace.
Returns success confirmation or error if job not found.`,
  inputSchema: toggleCronSchema,
  execute: async (params: z.infer<typeof toggleCronSchema>): Promise<CronJobResult> => {
    const { id, enabled } = params;
    const workingDir = process.cwd();

    try {
      await setCronEnabled(id, enabled, workingDir);

      return {
        success: true,
        error: undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      return {
        success: false,
        error: `Failed to toggle cron job: ${errorMessage}`,
      };
    }
  },
});

/**
 * Returns all cron management tools.
 *
 * @returns Object containing scheduleCron, listCrons, removeCron, and toggleCron tools.
 */
export function createCronTools() {
  return {
    scheduleCron,
    listCrons,
    removeCron,
    toggleCron,
  };
}
