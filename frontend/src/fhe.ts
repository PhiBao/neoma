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

// Observable loading state so UI can show progress
type FheLoadingListener = (state: FheLoadingState) => void;
export type FheLoadingState = "idle" | "downloading" | "initializing" | "ready";
let _loadingState: FheLoadingState = "idle";
const _listeners = new Set<FheLoadingListener>();

export function getFheLoadingState(): FheLoadingState { return _loadingState; }
export function onFheLoadingChange(fn: FheLoadingListener): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}
function setLoadingState(s: FheLoadingState) {
  _loadingState = s;
  _listeners.forEach((fn) => fn(s));
}

/** Returns true if the FHE SDK is already loaded + initialized */
export function isFheReady(): boolean { return sdkInitialized; }

/**
 * Dynamically import and initialize the FHEVM SDK.
 * This loads ~20 MB of WASM, so we do it lazily on first vote.
 */
async function getSDK() {
  if (!sdkModule) {
    setLoadingState("downloading");
    sdkModule = await import("@zama-fhe/relayer-sdk/web");
  }
  if (!sdkInitialized) {
    setLoadingState("initializing");
    await sdkModule.initSDK();
    sdkInitialized = true;
    setLoadingState("ready");
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
  choice: number,
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

/**
 * Public-decrypt a set of ciphertext handles via the Zama Relayer.
 *
 * Returns { abiEncodedClearValues, decryptionProof } which can be passed
 * directly to finalizeResolution() or executeClaim() on-chain.
 *
 * @param provider - The EIP-1193 provider
 * @param handles - Array of bytes32 handle strings from the contract
 */
export async function publicDecryptHandles(
  provider: Eip1193Provider,
  handles: string[],
): Promise<{ abiEncodedClearValues: string; decryptionProof: string }> {
  const instance = await getFhevmInstance(provider);
  const result = await instance.publicDecrypt(handles);
  return {
    abiEncodedClearValues: result.abiEncodedClearValues,
    decryptionProof: result.decryptionProof,
  };
}
