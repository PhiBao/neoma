/**
 * FHE encryption utility using @zama-fhe/relayer-sdk
 *
 * Handles WASM initialization and encrypted input creation for the
 * Zama FHEVM on Sepolia testnet.
 */

import type { Eip1193Provider } from "ethers";

// Lazy-loaded relayer-sdk module (heavy WASM bundle)
let sdkModule: typeof import("@zama-fhe/relayer-sdk/web") | null = null;

// Cached FhevmInstance (per network provider)
let cachedInstance: Awaited<ReturnType<typeof import("@zama-fhe/relayer-sdk/web")["createInstance"]>> | null = null;
let sdkInitialized = false;

/**
 * Dynamically import and initialize the FHEVM SDK.
 * This loads ~20 MB of WASM, so we do it lazily on first vote.
 */
async function getSDK() {
  if (!sdkModule) {
    sdkModule = await import("@zama-fhe/relayer-sdk/web");
  }
  if (!sdkInitialized) {
    await sdkModule.initSDK();
    sdkInitialized = true;
  }
  return sdkModule;
}

/**
 * Create (or reuse) an FhevmInstance connected to Sepolia.
 *
 * @param provider - The EIP-1193 provider from the user's wallet
 */
export async function getFhevmInstance(provider: Eip1193Provider) {
  if (cachedInstance) return cachedInstance;

  const sdk = await getSDK();
  cachedInstance = await sdk.createInstance({
    ...sdk.SepoliaConfig,
    network: provider,
  });

  return cachedInstance;
}

/**
 * Encrypt a uint8 vote choice for a specific market contract.
 *
 * @param provider - The EIP-1193 provider from the user's wallet
 * @param contractAddress - The OpinionMarket contract address
 * @param userAddress - The voter's address
 * @param choice - The vote option (0 or 1)
 * @returns { handles, inputProof } ready to pass to contract.vote()
 */
export async function encryptVote(
  provider: Eip1193Provider,
  contractAddress: string,
  userAddress: string,
  choice: 0 | 1,
): Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }> {
  const instance = await getFhevmInstance(provider);
  const input = instance.createEncryptedInput(contractAddress, userAddress);
  input.add8(choice);
  return input.encrypt();
}

/**
 * Reset the cached instance (e.g. on wallet disconnect / network switch).
 */
export function resetFhevmInstance() {
  cachedInstance = null;
}
