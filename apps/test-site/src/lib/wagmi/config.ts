import { createConfig, http } from '@wagmi/core'
import { base } from 'viem/chains'
import { injected } from '@wagmi/connectors'

export const wagmiConfig = createConfig({
	chains: [base],
	connectors: [injected()],
	transports: {
		[base.id]: http()
	}
})
