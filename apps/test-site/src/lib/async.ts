export interface WaitUntilOptions {
	timeoutMs?: number
	intervalMs?: number
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function waitUntil(
	check: () => boolean | Promise<boolean>,
	{ timeoutMs = 20_000, intervalMs = 1_000 }: WaitUntilOptions = {}
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs
	while (Date.now() <= deadline) {
		if (await check()) {
			return true
		}
		await sleep(intervalMs)
	}
	return false
}
