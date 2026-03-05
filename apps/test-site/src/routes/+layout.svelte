<script lang="ts">
	import type { Snippet } from 'svelte'
	import { env } from '$env/dynamic/public'
	import DynamicSvelteWrapper from '$lib/dynamic/DynamicSvelteWrapper.svelte'

	let { children }: { children: Snippet } = $props()

	const commitSha = env.PUBLIC_VERCEL_GIT_COMMIT_SHA
	const version = commitSha ? commitSha.slice(0, 7) : 'dev'
</script>

<DynamicSvelteWrapper />

<div class="layout">
	<header>
		<h1>quant.bot</h1>
		<span class="badge">test site</span>
		<span class="version-label">v {version}</span>
	</header>
	<main>
		{@render children()}
	</main>
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
		background: #f9fafb;
		color: #111827;
	}

	.layout {
		max-width: 800px;
		margin: 0 auto;
		padding: 1rem;
	}

	header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 0;
		border-bottom: 1px solid #e5e7eb;
		margin-bottom: 1.5rem;
	}

	h1 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 700;
	}

	.badge {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		background: #dbeafe;
		color: #1d4ed8;
		padding: 0.15rem 0.5rem;
		border-radius: 9999px;
	}

	.version-label {
		font-size: 0.7rem;
		font-family: monospace;
		color: #9ca3af;
	}

	main {
		min-height: 60vh;
	}
</style>
