import { createBashTool } from 'bash-tool';
import type { BashToolkit, CreateBashToolOptions } from 'bash-tool';
import type { Tool as AiTool } from 'ai';

/** Configuration used when constructing bash/file tools. */
export interface BashToolConfig {
  destination?: string;
  files?: Record<string, string>;
  uploadDirectory?: {
    source: string;
    include?: string;
  };
  extraInstructions?: string;
  onBeforeBashCall?: (input: { command: string }) => { command: string } | undefined;
  onAfterBashCall?: (input: { command: string; result: { stdout: string; stderr: string; exitCode: number } }) => { result: { stdout: string; stderr: string; exitCode: number } } | undefined;
}

/** Bash toolkit tools and sandbox handle exposed to callers. */
export interface BashTools {
  bash: AiTool<{ command: string }, { stdout: string; stderr: string; exitCode: number }>;
  readFile: AiTool<{ path: string }, { content: string }>;
  writeFile: AiTool<{ path: string; content: string }, { success: boolean }>;
  sandbox: BashToolkit['sandbox'];
}

/**
 * Creates bash and file tools backed by `bash-tool`.
 *
 * @param config Optional setup values forwarded to `createBashTool`.
 * @returns Tool instances plus the underlying sandbox.
 */
export async function createBashTools(config?: BashToolConfig): Promise<BashTools> {
  const options: CreateBashToolOptions = {
    destination: config?.destination,
    files: config?.files,
    uploadDirectory: config?.uploadDirectory,
    extraInstructions: config?.extraInstructions,
    onBeforeBashCall: config?.onBeforeBashCall,
    onAfterBashCall: config?.onAfterBashCall,
  };

  const bashToolkit = await createBashTool(options);
  
  return {
    bash: bashToolkit.tools.bash,
    readFile: bashToolkit.tools.readFile,
    writeFile: bashToolkit.tools.writeFile,
    sandbox: bashToolkit.sandbox,
  };
}

export { createBashTool };
export type { BashToolkit, CreateBashToolOptions };
