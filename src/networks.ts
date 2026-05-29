/**
 * Hedera network configuration.
 *
 * Mirror Node REST base URLs are public and keyless — all read/query tools use them.
 * nodeAccountIds are stable consensus-node accounts used when freezing a build-only
 * transaction so the serialized bytes target real nodes.
 */

export interface NetworkConfig {
  /** Human label, e.g. "testnet" */
  name: "mainnet" | "testnet" | "previewnet";
  /** Mirror Node REST base URL (no trailing slash) */
  mirror: string;
  /** Consensus node account IDs used for build-only transaction freezing */
  nodeAccountIds: string[];
  /** HashScan explorer base for this network */
  explorer: string;
}

const NETWORKS: Record<string, NetworkConfig> = {
  mainnet: {
    name: "mainnet",
    mirror: "https://mainnet-public.mirrornode.hedera.com",
    nodeAccountIds: ["0.0.3", "0.0.4", "0.0.5", "0.0.6", "0.0.7"],
    explorer: "https://hashscan.io/mainnet",
  },
  testnet: {
    name: "testnet",
    mirror: "https://testnet.mirrornode.hedera.com",
    nodeAccountIds: ["0.0.3", "0.0.4", "0.0.5", "0.0.6", "0.0.7", "0.0.8", "0.0.9"],
    explorer: "https://hashscan.io/testnet",
  },
  previewnet: {
    name: "previewnet",
    mirror: "https://previewnet.mirrornode.hedera.com",
    nodeAccountIds: ["0.0.3", "0.0.4", "0.0.5", "0.0.6"],
    explorer: "https://hashscan.io/previewnet",
  },
};

export function resolveNetwork(): NetworkConfig {
  const requested = (process.env.HEDERA_NETWORK || "testnet").toLowerCase();
  const net = NETWORKS[requested];
  if (!net) {
    throw new Error(
      `Unknown HEDERA_NETWORK="${requested}". Use one of: mainnet, testnet, previewnet.`,
    );
  }
  if (process.env.HEDERA_MIRROR_URL) {
    return { ...net, mirror: process.env.HEDERA_MIRROR_URL.replace(/\/+$/, "") };
  }
  return net;
}
