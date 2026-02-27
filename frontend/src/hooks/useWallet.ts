import { useState, useEffect, useCallback } from "react";
import { BrowserProvider, JsonRpcSigner, ethers } from "ethers";
import { SEPOLIA_CHAIN_ID } from "../contracts";

declare global {
  interface Window {
    ethereum?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}

export interface WalletState {
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  address: string;
  chainId: number;
  isConnected: boolean;
  isCorrectChain: boolean;
}

export function useWallet() {
  const [wallet, setWallet] = useState<WalletState>({
    provider: null,
    signer: null,
    address: "",
    chainId: 0,
    isConnected: false,
    isCorrectChain: false,
  });

  const updateWallet = useCallback(async (ethereum: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const provider = new BrowserProvider(ethereum);
    const accounts: string[] = await provider.send("eth_accounts", []);
    if (accounts.length === 0) {
      setWallet({ provider: null, signer: null, address: "", chainId: 0, isConnected: false, isCorrectChain: false });
      return;
    }
    const signer = await provider.getSigner();
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);
    setWallet({
      provider,
      signer,
      address: accounts[0],
      chainId,
      isConnected: true,
      isCorrectChain: chainId === SEPOLIA_CHAIN_ID,
    });
  }, []);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask or another Web3 wallet.");
      return;
    }
    await window.ethereum.request({ method: "eth_requestAccounts" });
    await updateWallet(window.ethereum);
  }, [updateWallet]);

  const switchToSepolia = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: ethers.toBeHex(SEPOLIA_CHAIN_ID) }],
      });
    } catch {
      // Chain not added — add it
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: ethers.toBeHex(SEPOLIA_CHAIN_ID),
          chainName: "Sepolia Testnet",
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://sepolia.infura.io/v3/"],
          blockExplorerUrls: ["https://sepolia.etherscan.io"],
        }],
      });
    }
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;
    updateWallet(window.ethereum);

    const handleAccountsChanged = () => updateWallet(window.ethereum);
    const handleChainChanged = () => window.location.reload();

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);
    return () => {
      window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum?.removeListener("chainChanged", handleChainChanged);
    };
  }, [updateWallet]);

  return { ...wallet, connect, switchToSepolia };
}
