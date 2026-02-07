import { tool } from 'ai';
import { z } from 'zod';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

export interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

export interface GrepResult {
  matches: GrepMatch[];
  error?: string;
}

const grepSchema = z.object({
  pattern: z.string().describe('The regex pattern to search for'),
  path: z.string().optional().describe('The directory to search in (defaults to current working directory)'),
  include: z.string().optional().describe('File glob pattern to filter files (e.g., "*.ts", "*.{js,ts}")'),
});

export const grepTool = tool({
  description: `Search for patterns in file contents using grep. 
Returns matches with file path, line number, and content.
Use this to find code, text, or patterns across multiple files.`,
  inputSchema: grepSchema,
  execute: async (params: z.infer<typeof grepSchema>): Promise<GrepResult> => {
    const { pattern, path, include } = params;
    
    try {
      const searchPath = path || process.cwd();
      const resolvedPath = resolve(searchPath);
      
      if (!existsSync(resolvedPath)) {
        return { matches: [], error: `Path does not exist: ${searchPath}` };
      }

      const includePattern = include ? `--include=${include}` : '';
      const escapedPattern = pattern.replace(/"/g, '\\"');
      const grepCommand = `grep -rn ${includePattern} -E "${escapedPattern}" "${resolvedPath}" 2>/dev/null || true`;
      
      let output: string;
      try {
        output = execSync(grepCommand, { 
          encoding: 'utf-8', 
          maxBuffer: 10 * 1024 * 1024 
        });
      } catch (error) {
        output = '';
      }

      if (!output.trim()) {
        return { matches: [] };
      }

      const matches: GrepMatch[] = output
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const match = line.match(/^([^:]+):(\d+):(.*)$/);
          if (match) {
            return {
              file: match[1],
              line: parseInt(match[2], 10),
              content: match[3],
            };
          }
          return null;
        })
        .filter((m): m is GrepMatch => m !== null);

      return { matches };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return { matches: [], error: `Grep execution failed: ${errorMessage}` };
    }
  },
});

export function createGrepTool() {
  return grepTool;
}

export default grepTool;
