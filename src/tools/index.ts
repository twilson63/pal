import { tool } from 'ai';
import { z } from 'zod';
import { createBashTool } from 'bash-tool';
import type { BashToolkit } from 'bash-tool';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import type { Tool as AiTool } from 'ai';

export interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

export type ToolMap = {
  bash: AiTool<{ command: string }, { stdout: string; stderr: string; exitCode: number }>;
  readFile: AiTool<{ path: string }, { content: string }>;
  writeFile: AiTool<{ path: string; content: string }, { success: boolean }>;
  grep: AiTool<{ pattern: string; path?: string; include?: string }, { matches: GrepMatch[]; error?: string }>;
  webSearch: AiTool<{ query: string; numResults?: number }, { results: WebSearchResult[]; error?: string }>;
};

export type ToolName = keyof ToolMap;

export const TOOL_NAMES: ToolName[] = ['bash', 'readFile', 'writeFile', 'grep', 'webSearch'];

const grepSchema = z.object({
  pattern: z.string().describe('The regex pattern to search for'),
  path: z.string().optional().describe('The directory to search in (defaults to current working directory)'),
  include: z.string().optional().describe('File glob pattern to filter files (e.g., "*.ts", "*.{js,ts}")'),
});

function createGrepTool(): AiTool<z.infer<typeof grepSchema>, { matches: GrepMatch[]; error?: string }> {
  return tool({
    description: 'Search for patterns in file contents using grep. Returns matches with file path, line number, and content.',
    inputSchema: grepSchema,
    execute: async (params): Promise<{ matches: GrepMatch[]; error?: string }> => {
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
}

const webSearchSchema = z.object({
  query: z.string().describe('The search query'),
  numResults: z.number().int().min(1).max(20).optional().describe('Number of results to return (default: 8, max: 20)'),
});

interface BraveApiResponse {
  web?: {
    results?: Array<{
      title: string;
      url: string;
      description?: string;
    }>;
  };
}

function createWebSearchTool(): AiTool<z.infer<typeof webSearchSchema>, { results: WebSearchResult[]; error?: string }> {
  return tool({
    description: 'Search the web using Brave Search API. Returns search results with title, URL, and snippet.',
    inputSchema: webSearchSchema,
    execute: async (params): Promise<{ results: WebSearchResult[]; error?: string }> => {
      const { query, numResults } = params;
      const apiKey = process.env.BRAVE_API_KEY;
      
      if (!apiKey) {
        return { 
          results: [], 
          error: 'BRAVE_API_KEY environment variable is not set. Please set it to use web search.' 
        };
      }

      try {
        const url = new URL('https://api.search.brave.com/res/v1/web/search');
        url.searchParams.set('q', query);
        url.searchParams.set('count', String(numResults ?? 8));
        url.searchParams.set('offset', '0');
        url.searchParams.set('mkt', 'en-US');
        url.searchParams.set('safesearch', 'moderate');

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'X-Subscription-Token': apiKey,
          },
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          return { 
            results: [], 
            error: `Brave API error (${response.status}): ${errorText}` 
          };
        }

        const data = await response.json() as BraveApiResponse;

        if (!data.web?.results || data.web.results.length === 0) {
          return { results: [] };
        }

        const results: WebSearchResult[] = data.web.results.map((result) => ({
          title: result.title,
          url: result.url,
          snippet: result.description || '',
        }));

        return { results };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return { results: [], error: `Web search failed: ${errorMessage}` };
      }
    },
  });
}

export async function createTools(): Promise<ToolMap> {
  const bashToolkit: BashToolkit = await createBashTool();

  return {
    bash: bashToolkit.tools.bash,
    readFile: bashToolkit.tools.readFile,
    writeFile: bashToolkit.tools.writeFile,
    grep: createGrepTool(),
    webSearch: createWebSearchTool(),
  };
}

export { createBashTool };
export type { BashToolkit };
