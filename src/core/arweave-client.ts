import { createHash } from "node:crypto";

/**
 * Information about a package from Arweave.
 */
export interface PackageInfo {
  id: string;
  version: string;
  signerAddress: string;
  sha256: string;
  timestamp: number;
}

/**
 * GraphQL response structure from Arweave.
 */
interface GraphQLResponse {
  data?: {
    transactions?: {
      edges: Array<{
        node: {
          id: string;
          tags: Array<{ name: string; value: string }>;
          block?: { timestamp: number };
        };
      }>;
    };
  };
  errors?: Array<{ message: string }>;
}

const DEFAULT_GATEWAY = "https://arweave.net";
const GRAPHQL_TIMEOUT = 10000;
const DOWNLOAD_TIMEOUT = 60000;
const MAX_RETRIES = 3;

function getGateway(): string {
  return process.env.ARWEAVE_GATEWAY || DEFAULT_GATEWAY;
}

/**
 * Queries Arweave GraphQL for the latest package from a publisher.
 *
 * @param publisherAddress - Arweave wallet address of the publisher
 * @returns Package info or null if no valid package found
 */
export async function queryLatestPackage(
  publisherAddress: string
): Promise<PackageInfo | null> {
  const query = `
    query GetLatestPackage($address: String!, $appName: String!) {
      transactions(
        owners: [$address]
        tags: [
          { name: "App-Name", values: [$appName] }
          { name: "Type", values: ["package"] }
        ]
        sort: HEIGHT_DESC
        first: 10
      ) {
        edges {
          node {
            id
            tags {
              name
              value
            }
            block {
              timestamp
            }
          }
        }
      }
    }
  `;

  const variables = {
    address: publisherAddress,
    appName: "pal",
  };

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${getGateway()}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(GRAPHQL_TIMEOUT),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = (await response.json()) as GraphQLResponse;

      if (result.errors) {
        throw new Error(`GraphQL error: ${result.errors[0].message}`);
      }

      const transactions = result.data?.transactions?.edges;
      if (!transactions || transactions.length === 0) {
        return null;
      }

      // Find the first transaction with valid semver
      for (const edge of transactions) {
        const node = edge.node;
        const tags = new Map(node.tags.map((t) => [t.name, t.value]));

        const version = tags.get("Version");
        const sha256 = tags.get("SHA-256");
        const signerAddress = tags.get("Signer-Address");

        if (!version || !sha256 || !signerAddress) {
          continue;
        }

        // Validate semver format (basic check)
        if (!/^\d+\.\d+\.\d+$/.test(version)) {
          console.warn(`Skipping transaction ${node.id}: invalid semver "${version}"`);
          continue;
        }

        return {
          id: node.id,
          version,
          signerAddress,
          sha256,
          timestamp: node.block?.timestamp || 0,
        };
      }

      return null;
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        if (error instanceof Error && error.name === "TimeoutError") {
          throw new Error(`GraphQL query timed out after ${GRAPHQL_TIMEOUT / 1000} seconds`);
        }
        throw error;
      }
      // Exponential backoff: 1s, 2s, 4s
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
    }
  }

  return null;
}

/**
 * Downloads a package from Arweave.
 *
 * @param transactionId - Arweave transaction ID
 * @returns Buffer containing the package data
 */
export async function downloadPackage(transactionId: string): Promise<Buffer> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${getGateway()}/${transactionId}`, {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        if (error instanceof Error && error.name === "TimeoutError") {
          throw new Error("Download timed out after 60 seconds");
        }
        throw new Error(`Failed to download package: ${error}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
    }
  }

  throw new Error("Failed to download package after all retries");
}

/**
 * Verifies the SHA256 hash of package data.
 *
 * @param data - Package data buffer
 * @param expectedHash - Expected SHA256 hash (hex string)
 * @returns true if hash matches
 */
export function verifyHash(data: Buffer, expectedHash: string): boolean {
  const hash = createHash("sha256").update(data).digest("hex");
  return hash === expectedHash.toLowerCase();
}
