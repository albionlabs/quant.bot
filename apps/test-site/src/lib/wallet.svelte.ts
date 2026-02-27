import { createWalletClient, custom, type WalletClient, type Address } from 'viem';
import { mainnet } from 'viem/chains';

interface WalletState {
	address: Address | null;
	connected: boolean;
	chainId: number;
}

let state = $state<WalletState>({
	address: null,
	connected: false,
	chainId: 1
});

let client: WalletClient | null = null;

export function getWallet() {
	return {
		get address() { return state.address; },
		get connected() { return state.connected; },
		get chainId() { return state.chainId; }
	};
}

export function getClient(): WalletClient | null {
	return client;
}

export async function connectWallet(): Promise<Address> {
	if (!window.ethereum) {
		throw new Error('No wallet found. Please install MetaMask or another browser wallet.');
	}

	client = createWalletClient({
		chain: mainnet,
		transport: custom(window.ethereum)
	});

	const [address] = await client.requestAddresses();
	const chainId = await client.getChainId();

	state.address = address;
	state.connected = true;
	state.chainId = chainId;

	window.ethereum.on('accountsChanged', handleAccountsChanged);
	window.ethereum.on('chainChanged', handleChainChanged);

	return address;
}

export function disconnectWallet() {
	if (window.ethereum) {
		window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
		window.ethereum.removeListener('chainChanged', handleChainChanged);
	}
	client = null;
	state.address = null;
	state.connected = false;
	state.chainId = 1;
}

function handleAccountsChanged(accounts: unknown) {
	const accts = accounts as string[];
	if (accts.length === 0) {
		disconnectWallet();
	} else {
		state.address = accts[0] as Address;
	}
}

function handleChainChanged(chainId: unknown) {
	state.chainId = Number(chainId);
}
