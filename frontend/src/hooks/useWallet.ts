import { useState, useEffect, useCallback, useRef } from "react";
import { BrowserProvider, JsonRpcSigner, JsonRpcProvider, ethers } from "ethers";
import type { Eip1193Provider } from "ethers";
import { SEPOLIA_CHAIN_ID, SEPOLIA_RPC } from "../contracts";
import { resetFhevmInstance } from "../fhe";

// ── EIP-6963 Types ───────────────────────────────────────────

export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface EIP6963Wallet {
  info: EIP6963ProviderInfo;
  provider: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

interface EIP6963AnnounceEvent extends CustomEvent {
  detail: EIP6963Wallet;
}

declare global {
  interface WindowEventMap {
    "eip6963:announceProvider": EIP6963AnnounceEvent;
  }
  interface Window {
    ethereum?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}

// ── Wallet State ─────────────────────────────────────────────

export interface WalletState {
  provider: BrowserProvider | null;
  rawProvider: Eip1193Provider | null;
  signer: JsonRpcSigner | null;
  address: string;
  chainId: number;
  isConnected: boolean;
  isCorrectChain: boolean;
}

/** Read-only provider for loading data without a wallet */
let _readProvider: JsonRpcProvider | null = null;
export function getReadProvider(): JsonRpcProvider {
  if (!_readProvider) {
    // Pass chainId + staticNetwork to skip async eth_chainId detection,
    // which otherwise causes a race condition on the first contract call.
    _readProvider = new JsonRpcProvider(SEPOLIA_RPC, SEPOLIA_CHAIN_ID, {
      staticNetwork: true,
    });
  }
  return _readProvider;
}

const EMPTY_WALLET: WalletState = {
  provider: null, rawProvider: null, signer: null, address: "", chainId: 0,
  isConnected: false, isCorrectChain: false,
};

export function useWallet() {
  const [wallet, setWallet] = useState<WalletState>(EMPTY_WALLET);
  const [connectError, setConnectError] = useState("");
  const [discoveredWallets, setDiscoveredWallets] = useState<EIP6963Wallet[]>([]);
  const [showWalletPicker, setShowWalletPicker] = useState(false);

  // Track the raw EIP-1193 provider we're connected to (for event cleanup)
  const rawProviderRef = useRef<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any

  // ── EIP-6963 Discovery ───────────────────────────────────

  useEffect(() => {
    const walletsMap = new Map<string, EIP6963Wallet>();

    const handleAnnounce = (e: EIP6963AnnounceEvent) => {
      const { info, provider } = e.detail;
      if (!walletsMap.has(info.uuid)) {
        walletsMap.set(info.uuid, { info, provider });
        setDiscoveredWallets(Array.from(walletsMap.values()));
      }
    };

    window.addEventListener("eip6963:announceProvider", handleAnnounce);
    // Ask installed wallets to announce themselves
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    return () => {
      window.removeEventListener("eip6963:announceProvider", handleAnnounce);
    };
  }, []);

  // ── Update wallet from raw provider ──────────────────────

  const updateWallet = useCallback(async (eipProvider: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      const provider = new BrowserProvider(eipProvider);
      const accounts: string[] = await provider.send("eth_accounts", []);
      if (accounts.length === 0) {
        setWallet(EMPTY_WALLET);
        return;
      }
      const signer = await provider.getSigner();
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);
      // ethers.getAddress() returns EIP-55 checksummed address,
      // required by fhevmjs / @zama-fhe/relayer-sdk
      const checksummedAddress = ethers.getAddress(accounts[0]);
      setWallet({
        provider, rawProvider: eipProvider as Eip1193Provider, signer, address: checksummedAddress, chainId,
        isConnected: true, isCorrectChain: chainId === SEPOLIA_CHAIN_ID,
      });
    } catch (err) {
      console.error("Failed to update wallet:", err);
      setWallet(EMPTY_WALLET);
    }
  }, []);

  // ── Connect to a specific EIP-6963 wallet ────────────────

  const connectWallet = useCallback(async (eipProvider: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    setConnectError("");
    try {
      await eipProvider.request({ method: "eth_requestAccounts" });
      rawProviderRef.current = eipProvider;
      await updateWallet(eipProvider);
      setShowWalletPicker(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Connection rejected";
      console.error("Wallet connect failed:", err);
      setConnectError(msg.slice(0, 120));
    }
  }, [updateWallet]);

  // ── Public connect: show picker if >1 wallet, auto-connect if 1 ──

  const connect = useCallback(async () => {
    setConnectError("");

    if (discoveredWallets.length > 1) {
      setShowWalletPicker(true);
      return;
    }

    if (discoveredWallets.length === 1) {
      await connectWallet(discoveredWallets[0].provider);
      return;
    }

    // Fallback: legacy window.ethereum
    if (window.ethereum) {
      await connectWallet(window.ethereum);
      return;
    }

    setConnectError("No wallet detected. Install MetaMask or another EVM wallet.");
  }, [discoveredWallets, connectWallet]);

  // ── Disconnect ───────────────────────────────────────────

  const disconnect = useCallback(() => {
    // Note: actual event listeners are cleaned up by the useEffect return below.
    // We just need to clear the ref so the next useEffect cycle removes them.
    rawProviderRef.current = null;
    resetFhevmInstance();
    setWallet(EMPTY_WALLET);
    setConnectError("");
  }, []);

  // ── Switch chain ─────────────────────────────────────────

  const switchToSepolia = useCallback(async () => {
    const p = rawProviderRef.current ?? window.ethereum;
    if (!p) return;
    try {
      await p.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: ethers.toBeHex(SEPOLIA_CHAIN_ID) }],
      });
    } catch {
      try {
        await p.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: ethers.toBeHex(SEPOLIA_CHAIN_ID),
            chainName: "Sepolia Testnet",
            nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
            rpcUrls: [SEPOLIA_RPC],
            blockExplorerUrls: ["https://sepolia.etherscan.io"],
          }],
        });
      } catch (addErr) {
        console.error("Failed to add chain:", addErr);
      }
    }
  }, []);

  // ── Listen to account / chain changes on active provider ─

  useEffect(() => {
    const provider = rawProviderRef.current;
    if (!provider) return;

    const handleAccountsChanged = (accs: string[]) => {
      if (accs.length === 0) {
        disconnect();
      } else {
        updateWallet(provider);
      }
    };
    const handleChainChanged = () => updateWallet(provider);

    provider.on?.("accountsChanged", handleAccountsChanged);
    provider.on?.("chainChanged", handleChainChanged);
    return () => {
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
      provider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [wallet.isConnected, updateWallet, disconnect]);

  // ── Auto-prompt switch when connected on wrong chain ─────

  useEffect(() => {
    if (wallet.isConnected && !wallet.isCorrectChain) {
      switchToSepolia();
    }
  }, [wallet.isConnected, wallet.isCorrectChain, switchToSepolia]);

  return {
    ...wallet,
    connect,
    connectWallet,
    disconnect,
    switchToSepolia,
    connectError,
    discoveredWallets,
    showWalletPicker,
    setShowWalletPicker,
  };
}
