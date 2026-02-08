import { tool } from 'ai';
import { z } from 'zod';

/** A single normalized web search result. */
export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

/** Response shape for web search tool execution. */
export interface WebSearchResponse {
  results: WebSearchResult[];
  error?: string;
}

interface BraveApiResponse {
  web?: {
    results?: Array<{
      title: string;
      url: string;
      description?: string;
    }>;
  };
}

const webSearchSchema = z.object({
  query: z.string().describe('The search query'),
  numResults: z.number().int().min(1).max(20).default(8).describe('Number of results to return (default: 8, max: 20)'),
});

/**
 * Brave Search tool configured for public web results.
 */
export const webSearchTool = tool({
  description: `Search the web using Brave Search API. 
Returns search results with title, URL, and snippet.
Requires BRAVE_API_KEY environment variable to be set.`,
  inputSchema: webSearchSchema,
  execute: async (params: z.infer<typeof webSearchSchema>): Promise<WebSearchResponse> => {
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
      url.searchParams.set('count', numResults.toString());
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

/**
 * Returns the shared web search tool instance.
 *
 * @returns `webSearchTool`.
 */
export function createWebSearchTool() {
  return webSearchTool;
}

export default webSearchTool;
